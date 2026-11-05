' CountPoint - post the differences of PI documents with MI20 (CHANGES SAP: the user presses "Post Difference" and Save).
' Usage: pidoc-post.vbs <system> <year> <outDir> <listFile> <statusFile> <waitSeconds> <doc> [clipboard]
'   With "clipboard" CountPoint has put all documents on the clipboard (one per line); <doc> is the first of them.
' Opens its OWN session on <system> (refuses any other), lists the documents in MI20, saves the list (%pc), ticks exactly
' those documents and WAITS for the user. When the user is back on the list (or closes the window) the documents are
' looked up in MI22 (display only) and that list is saved to <statusFile>. Output: {"ok":true,"screens":"..."}.
Option Explicit
On Error Resume Next

Const PLANT = "D301"
Dim systemName, year, outDir, listFile, statusFile, waitSeconds, firstDoc, fromClipboard
Dim app, conn, base, s, i, before, beforeIds, ownId, fso, ticked, screens, last, current, leftList

Function JsonText(value)
  Dim t
  t = CStr(value)
  t = Replace(t, "\", "\\")
  t = Replace(t, """", "\""")
  t = Replace(t, vbCr, " ")
  t = Replace(t, vbLf, " ")
  JsonText = """" & t & """"
End Function

Sub Finish(ok, text)
  CloseOwnSession
  If ok Then
    WScript.StdOut.WriteLine "{""ok"":true,""ticked"":" & ticked & ",""screens"":" & JsonText(screens) & "}"
  Else
    WScript.StdOut.WriteLine "{""ok"":false,""error"":" & JsonText(text) & ",""screens"":" & JsonText(screens) & "}"
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

Function SessionOpen()
  Dim n
  SessionOpen = False
  Err.Clear
  For n = 0 To conn.Children.Count - 1
    If conn.Children(CInt(n)).Id = ownId Then SessionOpen = True
  Next
  Err.Clear
End Function

Sub CloseOwnSession()
  Dim n
  If s Is Nothing Then Exit Sub
  If Not SessionOpen() Then Set s = Nothing : Exit Sub
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
    If Not SessionOpen() Then Exit For
  Next
  Set s = Nothing
End Sub

Sub Check(path, expected)
  If UCase(Trim(s.findById(path).Text)) <> UCase(expected) Then Finish False, "field-not-set: " & path & " = '" & s.findById(path).Text & "'"
End Sub

Sub SetFields(names, value)
  Dim name
  For Each name In names
    s.findById("wnd[0]/usr/" & name).Text = value
  Next
End Sub

Sub UploadClipboard(button, field)
  Dim attempt
  For attempt = 1 To 3
    s.findById("wnd[0]/usr/" & button).press
    WaitIdle
    s.findById("wnd[1]/tbar[0]/btn[16]").press
    WaitIdle
    s.findById("wnd[1]/tbar[0]/btn[24]").press
    WaitIdle
    s.findById("wnd[1]/tbar[0]/btn[8]").press
    WaitIdle
    If Err.Number <> 0 Then Err.Clear : Finish False, "multiple-selection-failed"
    ' The clipboard is sometimes not ready on the first try.
    If UCase(Trim(s.findById("wnd[0]/usr/" & field).Text)) = UCase(firstDoc) Then Exit Sub
    WScript.Sleep 500
  Next
End Sub

Function SaveList(file)
  Dim n, radio, chosen
  SaveList = False
  chosen = False
  s.findById("wnd[0]/tbar[0]/okcd").Text = "%pc"
  s.findById("wnd[0]").sendVKey 0
  WaitIdle
  For n = 0 To 9
    Set radio = s.findById("wnd[1]/usr/subSUBSCREEN_STEPLOOP:SAPLSPO5:0150/sub:SAPLSPO5:0150/radSPOPLI-SELFLAG[" & n & ",0]")
    If Err.Number <> 0 Then Err.Clear : Exit For
    If InStr(1, radio.Text, "Tab", vbTextCompare) > 0 Then radio.Select : chosen = True : Exit For
  Next
  If Not chosen Then Exit Function
  s.findById("wnd[1]/tbar[0]/btn[0]").press
  WaitIdle
  s.findById("wnd[1]/usr/ctxtDY_PATH").Text = outDir
  s.findById("wnd[1]/usr/ctxtDY_FILENAME").Text = file
  s.findById("wnd[1]/usr/ctxtDY_FILE_ENCODING").Text = "4110"
  s.findById("wnd[1]/tbar[0]/btn[11]").press
  WaitIdle
  If Err.Number <> 0 Then Exit Function
  SaveList = fso.FileExists(outDir & "\" & file)
End Function

' The list holds only CountPoint's documents (filtered by number, plant and year), so "Select All" ticks exactly those.
Function TickAll()
  s.findById("wnd[0]/tbar[1]/btn[5]").press
  WaitIdle
  TickAll = 1
  If Err.Number <> 0 Then Err.Clear : TickAll = 0
End Function

systemName = WScript.Arguments(0)
year = WScript.Arguments(1)
outDir = WScript.Arguments(2)
listFile = WScript.Arguments(3)
statusFile = WScript.Arguments(4)
waitSeconds = CLng(WScript.Arguments(5))
firstDoc = WScript.Arguments(6)
fromClipboard = (WScript.Arguments.Count > 7)
Set s = Nothing
ticked = 0
screens = ""
Set fso = CreateObject("Scripting.FileSystemObject")
If Err.Number <> 0 Then Err.Clear : Finish False, "arguments"
If Len(year) <> 4 Or Len(firstDoc) < 9 Then Finish False, "arguments"
If fso.FileExists(outDir & "\" & listFile) Then fso.DeleteFile outDir & "\" & listFile
If fso.FileExists(outDir & "\" & statusFile) Then fso.DeleteFile outDir & "\" & statusFile

Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-not-running"
Set conn = Nothing
For i = 0 To app.Children.Count - 1
  If app.Children(CInt(i)).Children.Count > 0 Then
    If app.Children(CInt(i)).Children(0).Info.SystemName = systemName Then Set conn = app.Children(CInt(i))
  End If
Next
Err.Clear
If conn Is Nothing Then Finish False, "not-logged-in-" & systemName
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
If s.Info.SystemName <> systemName Then Finish False, "wrong-system"
Err.Clear

s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMI20"
s.findById("wnd[0]").sendVKey 0
WaitIdle
If Err.Number <> 0 Or s.Info.Transaction <> "MI20" Then Err.Clear : Finish False, "no-access-mi20"
SetFields Array("ctxtIM_MATNR-LOW", "ctxtIM_MATNR-HIGH", "ctxtIM_WERKS-HIGH", "ctxtIM_LGORT-LOW", "ctxtIM_LGORT-HIGH", "ctxtIM_CHARG-LOW", _
  "txtIM_IBLNR-LOW", "txtIM_IBLNR-HIGH", "ctxtIM_INVNU-LOW", "ctxtSOBKZ-LOW", "txtGJAHR-HIGH", "ctxtZLDAT-LOW", "ctxtZLDAT-HIGH", _
  "ctxtGIDAT-LOW", "ctxtGIDAT-HIGH", "txtXBLNI-LOW", "ctxtGRUND-LOW", "txtIIWERT", "ctxtP_VARI"), ""
If fromClipboard Then UploadClipboard "btn%_IM_IBLNR_%_APP_%-VALU_PUSH", "txtIM_IBLNR-LOW" Else s.findById("wnd[0]/usr/txtIM_IBLNR-LOW").Text = firstDoc
s.findById("wnd[0]/usr/ctxtIM_WERKS-LOW").Text = PLANT
s.findById("wnd[0]/usr/txtGJAHR-LOW").Text = year
s.findById("wnd[0]/usr/radP_LEINF").Select
s.findById("wnd[0]/usr/chkP_ALVTR").Selected = False
If Err.Number <> 0 Then Err.Clear : Finish False, "mi20-screen-changed"
Check "wnd[0]/usr/txtIM_IBLNR-LOW", firstDoc
s.findById("wnd[0]").sendVKey 8
WaitIdle
If CStr(s.Info.ScreenNumber) = "1000" Then Err.Clear : Finish False, "sap: " & s.findById("wnd[0]/sbar").Text
If Not SaveList(listFile) Then Err.Clear : Finish False, "read-failed"
ticked = TickAll()
If ticked = 0 Then Finish False, "select-all-failed"

' Hand over: "Post Difference", then Save once per document. Every screen change is logged.
s.findById("wnd[0]").Restore
s.findById("wnd[0]").SetFocus
Err.Clear
last = s.Info.Program & "/" & s.Info.ScreenNumber & "/" & s.Children.Count
screens = last
leftList = False
For i = 1 To waitSeconds * 2
  WScript.Sleep 500
  If Not SessionOpen() Then Set s = Nothing : Exit For
  If Not s.Busy Then
    current = s.Info.Program & "/" & s.Info.ScreenNumber & "/" & s.Children.Count
    If current <> last Then
      screens = screens & " > " & current & " [" & s.findById("wnd[0]/sbar").Text & "]"
      last = current
      If InStr(current, "SAPMSSY0/120/1") = 0 Then leftList = True
    End If
    ' Back on a plain list after posting: done.
    If leftList And current = "SAPMSSY0/120/1" Then Exit For
  End If
  Err.Clear
Next
If i > waitSeconds * 2 Then Finish False, "timeout"
If s Is Nothing Then
  ' The user closed the window: open a fresh session only to read the status (display only).
  base.CreateSession
  For i = 1 To 100
    If conn.Children.Count > before Then Exit For
    WScript.Sleep 100
  Next
  WScript.Sleep 300
  For i = 0 To conn.Children.Count - 1
    If InStr(beforeIds, "|" & conn.Children(CInt(i)).Id & "|") = 0 Then Set s = conn.Children(CInt(i))
  Next
  If s Is Nothing Then Finish False, "closed-unknown"
  ownId = s.Id
  WaitIdle
End If

' Status of the documents in MI22 (display only).
Err.Clear
s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMI22"
s.findById("wnd[0]").sendVKey 0
WaitIdle
SetFields Array("ctxtIM_MATNR-LOW", "ctxtIM_MATNR-HIGH", "ctxtIM_WERKS-HIGH", "ctxtIM_LGORT-LOW", "ctxtIM_LGORT-HIGH", "ctxtIM_CHARG-LOW", _
  "txtIM_IBLNR-LOW", "txtIM_IBLNR-HIGH", "ctxtIM_INVNU-LOW", "ctxtIM_INVNU-HIGH", "ctxtZLDAT-LOW", "ctxtZLDAT-HIGH", "ctxtGIDAT-LOW", "ctxtGIDAT-HIGH", _
  "txtBUCHP-LOW", "txtBUCHP-HIGH", "ctxtPA_VARI"), ""
If fromClipboard Then UploadClipboard "btn%_IM_IBLNR_%_APP_%-VALU_PUSH", "txtIM_IBLNR-LOW" Else s.findById("wnd[0]/usr/txtIM_IBLNR-LOW").Text = firstDoc
s.findById("wnd[0]/usr/ctxtIM_WERKS-LOW").Text = PLANT
If Err.Number <> 0 Then Err.Clear : Finish False, "mi22-screen-changed"
s.findById("wnd[0]").sendVKey 8
WaitIdle
If CStr(s.Info.ScreenNumber) = "1000" Then Err.Clear : Finish False, "status-not-found"
If Not SaveList(statusFile) Then Err.Clear : Finish False, "read-failed"
Finish True, ""
