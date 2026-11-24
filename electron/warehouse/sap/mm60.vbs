' Lagerstyring - SAP's material descriptions via MM60 (material list). Read only: no other buttons than run and save.
' Usage: mm60.vbs <outDir> <outFile> <inFile> [material]
' The Hub puts the materials (one per line, same as inFile) on the clipboard before calling; VBScript cannot.
' With [material] (background lookups) that one material is typed into the field and the clipboard is not used.
' Opens its OWN session, uploads the materials into the material multiple selection, no plant filter, runs the list
' (F8) and writes UTF-8 tab-separated MATNR, MAKTX. Never runs without the material filter (MM60 would list every
' material in SAP) and stops if the result is far larger than the number of materials asked for.
' Output: {"ok":true,"rows":N} or {"ok":false,"error":"..."}.
Option Explicit
On Error Resume Next

Dim outDir, outFile, inFile, app, conn, base, s, i, before, beforeIds, fso, rows, grid, ownId
Dim materials, firstMaterial, asked, text, oneMaterial

Function JsonText(value)
  Dim t
  t = CStr(value)
  t = Replace(t, "\", "\\")
  t = Replace(t, """", "\""")
  t = Replace(t, vbCr, " ")
  t = Replace(t, vbLf, " ")
  JsonText = """" & t & """"
End Function

Sub Finish(ok, message)
  CloseOwnSession
  If ok Then
    WScript.StdOut.WriteLine "{""ok"":true,""rows"":" & rows & "}"
  Else
    WScript.StdOut.WriteLine "{""ok"":false,""error"":" & JsonText(message) & "}"
  End If
  WScript.Quit 0
End Sub

Sub WaitIdle()
  Dim n
  For n = 1 To 3000
    If s Is Nothing Then Exit Sub
    If Not s.Busy Then Exit Sub
    WScript.Sleep 100
  Next
End Sub

Sub CloseOwnSession()
  Dim n, stillOpen, k
  If s Is Nothing Then Exit Sub
  Err.Clear
  Do While s.Children.Count > 1
    s.findById("wnd[" & (s.Children.Count - 1) & "]").sendVKey 12
    WaitIdle
    If Err.Number <> 0 Then Exit Do
  Loop
  Err.Clear
  s.findById("wnd[0]/tbar[0]/okcd").Text = "/i"
  s.findById("wnd[0]").sendVKey 0
  For n = 1 To 50
    WScript.Sleep 100
    stillOpen = False
    For k = 0 To conn.Children.Count - 1
      If conn.Children(CInt(k)).Id = ownId Then stillOpen = True
    Next
    If Not stillOpen Then Exit For
  Next
  Set s = Nothing
End Sub

Function FindGridIn(obj)
  Dim k, ch, found
  Set FindGridIn = Nothing
  For k = 0 To obj.Children.Count - 1
    Set ch = obj.Children(CInt(k))
    If ch.Type = "GuiShell" Then
      If ch.SubType = "GridView" Then
        Set FindGridIn = ch
        Exit Function
      End If
    End If
    If ch.ContainerType Then
      Set found = FindGridIn(ch)
      If Not found Is Nothing Then
        Set FindGridIn = found
        Exit Function
      End If
    End If
  Next
End Function

' The "Save list in file" popup: choose tab-separated text, then name the file.
Function SaveAsTabText()
  Dim k, radio, chosen
  SaveAsTabText = False
  chosen = False
  For k = 0 To 9
    Set radio = s.findById("wnd[1]/usr/subSUBSCREEN_STEPLOOP:SAPLSPO5:0150/sub:SAPLSPO5:0150/radSPOPLI-SELFLAG[" & k & ",0]")
    If Err.Number <> 0 Then Err.Clear : Exit For
    If InStr(1, radio.Text, "Tab", vbTextCompare) > 0 Then radio.Select : chosen = True : Exit For
  Next
  If Not chosen Then Exit Function
  s.findById("wnd[1]/tbar[0]/btn[0]").press
  WaitIdle
  s.findById("wnd[1]/usr/ctxtDY_PATH").Text = outDir
  s.findById("wnd[1]/usr/ctxtDY_FILENAME").Text = outFile
  s.findById("wnd[1]/usr/ctxtDY_FILE_ENCODING").Text = "4110"
  s.findById("wnd[1]/tbar[0]/btn[11]").press
  WaitIdle
  If Err.Number <> 0 Then Exit Function
  SaveAsTabText = fso.FileExists(outDir & "\" & outFile)
End Function

outDir = WScript.Arguments(0)
outFile = WScript.Arguments(1)
inFile = WScript.Arguments(2)
rows = 0
Set s = Nothing
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FolderExists(outDir) Then Finish False, "out-dir-missing"
If fso.FileExists(outDir & "\" & outFile) Then fso.DeleteFile outDir & "\" & outFile
text = fso.OpenTextFile(outDir & "\" & inFile, 1).ReadAll
If Err.Number <> 0 Then Err.Clear : Finish False, "in-file-missing"
materials = Split(Replace(text, vbCr, ""), vbLf)
asked = 0
firstMaterial = ""
For i = 0 To UBound(materials)
  If Len(Trim(materials(i))) > 0 Then
    asked = asked + 1
    If firstMaterial = "" Then firstMaterial = UCase(Trim(materials(i)))
  End If
Next
If asked = 0 Then Finish False, "no-materials"
oneMaterial = ""
If WScript.Arguments.Count > 3 Then oneMaterial = UCase(Trim(WScript.Arguments(3)))
If Len(oneMaterial) > 40 Then Finish False, "material-invalid"
If Len(oneMaterial) > 0 Then firstMaterial = oneMaterial : asked = 1

Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-not-running"
' The connection to the SAP system the Hub is set to (COUNTPOINT_SAP_SYSTEM); never another system.
Function SystemConnection(engine)
  Dim n, target, wantedSystem
  Set SystemConnection = Nothing
  wantedSystem = CreateObject("WScript.Shell").Environment("PROCESS")("COUNTPOINT_SAP_SYSTEM")
  For n = 0 To engine.Children.Count - 1
    Set target = engine.Children(CInt(n))
    If target.Children.Count > 0 Then
      If wantedSystem = "" Or target.Children(0).Info.SystemName = wantedSystem Then Set SystemConnection = target : Exit Function
    End If
  Next
  Err.Clear
End Function

Set conn = SystemConnection(app)
If conn Is Nothing Then Err.Clear : Finish False, "not-logged-in"
Set base = Nothing
For i = 0 To conn.Children.Count - 1
  If Not conn.Children(CInt(i)).Busy Then Set base = conn.Children(CInt(i)) : Exit For
Next
If base Is Nothing Then Finish False, "sap-busy"
before = conn.Children.Count
beforeIds = "|"
For i = 0 To conn.Children.Count - 1
  beforeIds = beforeIds & conn.Children(CInt(i)).Id & "|"
Next
base.CreateSession
For i = 1 To 100
  If conn.Children.Count > before Then Exit For
  WScript.Sleep 100
Next
WScript.Sleep 300
For i = 0 To conn.Children.Count - 1
  If InStr(beforeIds, "|" & conn.Children(CInt(i)).Id & "|") = 0 Then Set s = conn.Children(CInt(i))
Next
If s Is Nothing Then Err.Clear : Finish False, "session-not-created"
ownId = s.Id
WaitIdle
s.findById("wnd[0]").Iconify
Err.Clear

s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMM60"
s.findById("wnd[0]").sendVKey 0
WaitIdle
If Err.Number <> 0 Or s.Info.Transaction <> "MM60" Then Err.Clear : Finish False, "no-access-mm60"

' SAP pre-fills fields from the user's parameter memory (e.g. the last plant); every filter is emptied first.
' Fields this release does not have are skipped.
Dim field
For Each field In Array("ctxtMS_MATNR-LOW", "ctxtMS_MATNR-HIGH", "ctxtMS_WERKS-LOW", "ctxtMS_WERKS-HIGH", "ctxtMS_MTART-LOW", "ctxtMS_MTART-HIGH", "ctxtMS_MATKL-LOW", "ctxtMS_MATKL-HIGH", "ctxtMS_ERNAM-LOW", "ctxtMS_ERNAM-HIGH")
  s.findById("wnd[0]/usr/" & field).Text = ""
  Err.Clear
Next
If Len(oneMaterial) > 0 Then
  s.findById("wnd[0]/usr/ctxtMS_MATNR-LOW").Text = oneMaterial
  If Err.Number <> 0 Then Err.Clear : Finish False, "screen-changed"
Else
  s.findById("wnd[0]/usr/btn%_MS_MATNR_%_APP_%-VALU_PUSH").press
  WaitIdle
  s.findById("wnd[1]/tbar[0]/btn[16]").press
  WaitIdle
  s.findById("wnd[1]/tbar[0]/btn[24]").press
  WaitIdle
  s.findById("wnd[1]/tbar[0]/btn[8]").press
  WaitIdle
  If Err.Number <> 0 Then Err.Clear : Finish False, "multiple-selection-failed"
End If
' The safety net: without the material filter MM60 lists every material in SAP.
If UCase(Trim(s.findById("wnd[0]/usr/ctxtMS_MATNR-LOW").Text)) <> firstMaterial Then Finish False, "material-filter-missing"

s.findById("wnd[0]").sendVKey 8
WaitIdle
Err.Clear
If CStr(s.Info.ScreenNumber) = "1000" Then
  If s.findById("wnd[0]/sbar").MessageType = "E" Then Finish False, "sap: " & s.findById("wnd[0]/sbar").Text
  Err.Clear
  rows = 0
  Finish True, ""
End If

Set grid = FindGridIn(s.findById("wnd[0]/usr"))
Err.Clear
If grid Is Nothing Then
  ' The classic list: List > Save > File via %pc, parsed by its column headers.
  s.findById("wnd[0]/tbar[0]/okcd").Text = "%pc"
  s.findById("wnd[0]").sendVKey 0
  WaitIdle
  If Not SaveAsTabText() Then Err.Clear : Finish False, "export-failed"
  rows = -1
  Finish True, ""
End If

Dim total, r, stream, line, cols, c, colId, colTitle, matCol, descCol, colList, matValue, descValue
total = grid.RowCount
If total > asked * 20 + 50 Then Finish False, "too-many-rows"

' The column names differ between SAP releases, layouts and logon languages: find the material and description
' columns by technical name first, then by their title. The error lists the columns SAP has, so they can be fixed.
matCol = ""
descCol = ""
colList = ""
Set cols = grid.ColumnOrder
For c = 0 To cols.Count - 1
  colId = ""
  colId = cols.Item(CLng(c))
  If Err.Number <> 0 Then Err.Clear : colId = cols(CLng(c))
  colTitle = ""
  colTitle = grid.GetDisplayedColumnTitle(colId)
  Err.Clear
  colList = colList & colId & "=" & colTitle & "; "
  If matCol = "" And UCase(colId) = "MATNR" Then matCol = colId
  If descCol = "" And UCase(colId) = "MAKTX" Then descCol = colId
Next
For c = 0 To cols.Count - 1
  colId = ""
  colId = cols.Item(CLng(c))
  If Err.Number <> 0 Then Err.Clear : colId = cols(CLng(c))
  colTitle = LCase(Trim(grid.GetDisplayedColumnTitle(colId)))
  Err.Clear
  If matCol = "" And (colTitle = "material" Or colTitle = "materiale" Or colTitle = "materialenummer" Or colTitle = "material number") Then matCol = colId
  If descCol = "" And colId <> matCol And (InStr(colTitle, "descr") > 0 Or InStr(colTitle, "beskriv") > 0 Or InStr(colTitle, "korttekst") > 0 Or InStr(colTitle, "materialetekst") > 0 Or InStr(colTitle, "material text") > 0) Then descCol = colId
Next
Err.Clear
If matCol = "" Or descCol = "" Then Finish False, "columns-not-found: " & colList

Set stream = CreateObject("ADODB.Stream")
stream.Type = 2
stream.Charset = "utf-8"
stream.Open
stream.WriteText "MATNR" & vbTab & "MAKTX" & vbCrLf
For r = 0 To total - 1
  If r Mod 30 = 0 Then grid.FirstVisibleRow = r : WaitIdle
  Err.Clear
  matValue = grid.GetCellValue(CLng(r), matCol)
  descValue = grid.GetCellValue(CLng(r), descCol)
  If Err.Number <> 0 Then
    line = Err.Description
    Err.Clear
    stream.Close
    Finish False, "read-failed: row " & r & " (" & matCol & "/" & descCol & ") " & line & " | " & colList
  End If
  line = matValue & vbTab & descValue
  stream.WriteText Replace(Replace(line, vbCr, " "), vbLf, " ") & vbCrLf
Next
stream.SaveToFile outDir & "\" & outFile, 2
stream.Close
If Err.Number <> 0 Then Err.Clear : Finish False, "write-failed"
rows = total
Finish True, ""
