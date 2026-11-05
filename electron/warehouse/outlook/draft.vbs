' CountPoint: opens a mail draft in classic Outlook. The draft is SHOWN to the user, never sent.
' Argument: a folder with to.txt, cc.txt, subject.txt, body.html and attachment.txt (UTF-8).
' Output: one JSON line, {"ok":true} or {"ok":false,"error":"<code>"}.
Option Explicit
On Error Resume Next

Dim dir, ol, mail, body, existing, pos, endTag, att

Sub Fail(code)
  WScript.Echo "{""ok"":false,""error"":""" & code & """}"
  WScript.Quit 0
End Sub

Function ReadUtf8(name)
  Dim stream
  ReadUtf8 = ""
  Set stream = CreateObject("ADODB.Stream")
  stream.Type = 2
  stream.Charset = "utf-8"
  stream.Open
  stream.LoadFromFile dir & "\" & name
  If stream.Size > 0 Then ReadUtf8 = stream.ReadText(-1)
  stream.Close
End Function

If WScript.Arguments.Count < 1 Then Fail "no-args"
dir = WScript.Arguments(0)

Set ol = Nothing
Set ol = GetObject(, "Outlook.Application")
If Err.Number <> 0 Then
  Err.Clear
  Set ol = CreateObject("Outlook.Application")
End If
If Err.Number <> 0 Then Fail "no-outlook"
If ol Is Nothing Then Fail "no-outlook"

Set mail = ol.CreateItem(0)
If Err.Number <> 0 Then Fail "create-failed"

mail.To = ReadUtf8("to.txt")
mail.CC = ReadUtf8("cc.txt")
mail.Subject = ReadUtf8("subject.txt")
If Err.Number <> 0 Then Fail "fields-failed"

att = ReadUtf8("attachment.txt")
If Len(att) > 0 Then mail.Attachments.Add att
If Err.Number <> 0 Then Fail "attach-failed"

' Display first, so Outlook adds the user's signature; the text goes in front of it.
mail.Display False
If Err.Number <> 0 Then Fail "display-failed"

body = ReadUtf8("body.html")
existing = mail.HTMLBody
pos = InStr(1, existing, "<body", 1)
endTag = 0
If pos > 0 Then endTag = InStr(pos, existing, ">")
If endTag > 0 Then
  mail.HTMLBody = Left(existing, endTag) & body & Mid(existing, endTag + 1)
Else
  mail.HTMLBody = body & existing
End If
If Err.Number <> 0 Then Fail "body-failed"

WScript.Echo "{""ok"":true}"
