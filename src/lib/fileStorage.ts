import { yieldToBrowser } from './utils'

export interface StoredFile {
  url: string
  filename: string
  size: number
  uploadedAt: number
}

class FileStorageService {
  private readonly CHUNK_SIZE = 256 * 1024
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024
  private readonly objectUrlCache = new Map<string, string>()

  private async storeInKV(file: File): Promise<StoredFile> {
    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error(`Filen er for stor (max ${this.MAX_FILE_SIZE / 1024 / 1024}MB). Din fil er ${(file.size / 1024 / 1024).toFixed(2)}MB`)
    }

    if (!file.name.match(/\.(docx?|DOCX?)$/)) {
      throw new Error('Kun Word-dokumenter (.doc, .docx) understøttes')
    }

    console.log('[FileStorage] Starting upload:', {
      name: file.name,
      size: file.size,
      type: file.type
    })
    
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const base64Data = await this.arrayBufferToBase64Async(bytes)
    
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
    const chunks: string[] = []
    
    for (let i = 0; i < base64Data.length; i += this.CHUNK_SIZE) {
      chunks.push(base64Data.substring(i, i + this.CHUNK_SIZE))
    }
    
    console.log(`[FileStorage] Splitting file into ${chunks.length} chunks`)
    
    try {
      const metadata = {
        filename: file.name,
        contentType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: file.size,
        uploadedAt: Date.now(),
        chunkCount: chunks.length
      }
      
      await window.kv.set(`${fileId}_meta`, metadata)
      console.log('[FileStorage] Metadata saved')
      
      for (let i = 0; i < chunks.length; i++) {
        await window.kv.set(`${fileId}_chunk_${i}`, chunks[i])
        console.log(`[FileStorage] Chunk ${i + 1}/${chunks.length} saved`)
      }
      
      const verification = await window.kv.get(`${fileId}_meta`)
      if (!verification) {
        throw new Error('Fil blev ikke gemt korrekt - verification failed')
      }
      
      console.log('[FileStorage] File saved successfully to KV')
    } catch (kvError) {
      console.error('[FileStorage] KV storage error:', kvError)
      
      try {
        await window.kv.delete(`${fileId}_meta`)
        for (let i = 0; i < chunks.length; i++) {
          await window.kv.delete(`${fileId}_chunk_${i}`)
        }
      } catch (cleanupError) {
        console.error('[FileStorage] Cleanup error:', cleanupError)
      }
      
      throw new Error('Kunne ikke gemme fil i storage. Prøv venligst en mindre fil.')
    }

    return {
      url: `kv://${fileId}`,
      filename: file.name,
      size: file.size,
      uploadedAt: Date.now()
    }
  }

  async uploadFile(file: File): Promise<StoredFile> {
    try {
      return await this.storeInKV(file)
    } catch (error) {
      console.error('Upload file error:', error)
      throw error
    }
  }

  /** Gemmer et billede (png/jpg/gif/webp/bmp, max 5MB) i chunked KV. Returnerer fileId uden kv://-præfiks. */
  async uploadImage(file: File): Promise<{ fileId: string; filename: string; size: number }> {
    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error(`Billedet er for stort (max ${this.MAX_FILE_SIZE / 1024 / 1024}MB). Dit billede er ${(file.size / 1024 / 1024).toFixed(2)}MB`)
    }
    const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name) || file.type.startsWith('image/')
    if (!isImage) {
      throw new Error('Kun billeder (PNG, JPG, GIF, WebP, BMP) understøttes')
    }

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const base64Data = await this.arrayBufferToBase64Async(bytes)

    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
    const chunks: string[] = []
    for (let i = 0; i < base64Data.length; i += this.CHUNK_SIZE) {
      chunks.push(base64Data.substring(i, i + this.CHUNK_SIZE))
    }

    try {
      await window.kv.set(`${fileId}_meta`, {
        filename: file.name,
        contentType: file.type || 'image/png',
        size: file.size,
        uploadedAt: Date.now(),
        chunkCount: chunks.length,
      })
      for (let i = 0; i < chunks.length; i++) {
        await window.kv.set(`${fileId}_chunk_${i}`, chunks[i])
      }
    } catch (kvError) {
      console.error('[FileStorage] KV image storage error:', kvError)
      try {
        await window.kv.delete(`${fileId}_meta`)
        for (let i = 0; i < chunks.length; i++) {
          await window.kv.delete(`${fileId}_chunk_${i}`)
        }
      } catch (cleanupError) {
        console.error('[FileStorage] Cleanup error:', cleanupError)
      }
      throw new Error('Kunne ikke gemme billedet i storage. Prøv et mindre billede.')
    }

    return { fileId, filename: file.name, size: file.size }
  }

  /** Objekt-URL til visning af et gemt billede. Cached pr. fileId for at undgå gentagne chunk-læsninger. */
  async getImageObjectUrl(fileId: string): Promise<string> {
    const cached = this.objectUrlCache.get(fileId)
    if (cached) return cached
    const blob = await this.downloadFile(`kv://${fileId}`)
    const url = URL.createObjectURL(blob)
    this.objectUrlCache.set(fileId, url)
    return url
  }

  async downloadFile(fileUrl: string): Promise<Blob> {
    if (fileUrl.startsWith('kv://')) {
      const fileId = fileUrl.replace('kv://', '')
      
      const metadata = await window.kv.get<{
        filename: string
        contentType: string
        size: number
        uploadedAt: number
        chunkCount: number
      }>(`${fileId}_meta`)

      if (!metadata) {
        const legacyData = await window.kv.get<{
          data: string
          filename: string
          contentType: string
          size: number
          uploadedAt: number
        }>(fileId)

        if (!legacyData) {
          throw new Error('File not found in storage')
        }

        const bytes = this.base64ToUint8Array(legacyData.data)
        return new Blob([bytes as BlobPart], { 
          type: legacyData.contentType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
        })
      }

      console.log(`[FileStorage] Downloading file with ${metadata.chunkCount} chunks`)
      
      const chunks: string[] = []
      for (let i = 0; i < metadata.chunkCount; i++) {
        const chunk = await window.kv.get<string>(`${fileId}_chunk_${i}`)
        if (!chunk) {
          throw new Error(`Missing chunk ${i} for file ${fileId}`)
        }
        chunks.push(chunk)
      }

      const base64Data = chunks.join('')
      const bytes = this.base64ToUint8Array(base64Data)
      return new Blob([bytes as BlobPart], { 
        type: metadata.contentType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      })
    } else if (fileUrl.startsWith('http')) {
      const response = await fetch(fileUrl)
      if (!response.ok) {
        throw new Error('Failed to download file from URL')
      }
      return await response.blob()
    } else {
      const bytes = this.base64ToUint8Array(fileUrl)
      return new Blob([bytes as BlobPart], { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      })
    }
  }

  async deleteFile(fileUrl: string): Promise<void> {
    if (fileUrl.startsWith('kv://')) {
      const fileId = fileUrl.replace('kv://', '')
      
      const metadata = await window.kv.get<{
        chunkCount: number
      }>(`${fileId}_meta`)

      if (metadata) {
        await window.kv.delete(`${fileId}_meta`)
        for (let i = 0; i < metadata.chunkCount; i++) {
          await window.kv.delete(`${fileId}_chunk_${i}`)
        }
      } else {
        await window.kv.delete(fileId)
      }
    }
  }

  // Koder i bidder på 60.000 bytes (deleligt med 3, så ingen chunk får midlertidig
  // '='-padding) og giver kontrollen tilbage til browseren mellem hver bid, så
  // store filer/billeder ikke fryser UI'et under kodningen.
  private async arrayBufferToBase64Async(bytes: Uint8Array): Promise<string> {
    const CHUNK_BYTES = 60_000
    const parts: string[] = []
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
      const slice = bytes.subarray(offset, offset + CHUNK_BYTES)
      let binary = ''
      for (let i = 0; i < slice.length; i++) binary += String.fromCharCode(slice[i])
      parts.push(btoa(binary))
      if (offset % (CHUNK_BYTES * 4) === 0) await yieldToBrowser()
    }
    return parts.join('')
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
  }
}

export const fileStorage = new FileStorageService()
