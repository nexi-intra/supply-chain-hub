' CountPoint - delete a PI document with MI02 (CHANGES SAP once the user presses Delete, the waste bin).
' Usage: pidoc-delete.vbs <system> <docNo> <year> <reference> <outDir> <statusFile> <waitSeconds>
' Opens its OWN session on <system> (refuses any other), opens the document header ("hat") and checks it carries
' CountPoint's <reference> (Physical Inventory Number) and is not counted or posted. Then WAITS for the user to delete it.
' Afterwards the document is looked up in MI22 (display only) and saved to <statusFile>.
' Output: {"ok":true,"message":"..","screens":".."} or {"ok":false,"error":".."}.
Option Explicit
On Error Resume Next

Const PLANT = "D301"
Dim systemName, docNo, year, reference, outDir, statusFile, waitSeconds, app, conn, base, s, i, before, beforeIds, ownId
Dim fso, message, screens, last, current, leftHeader

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
    WScript.StdOut.WriteLine "{""ok"":true,""message"":" & JsonText(text) & ",""screens"":" & JsonText(screens) & "}"
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

Sub OpenSession()
  Set s = Nothing
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

systemName = WScript.Arguments(0)
docNo = WScript.Arguments(1)
year = WScript.Arguments(2)
reference = UCase(WScript.Arguments(3))
outDir = WScript.Arguments(4)
statusFile = WScript.Arguments(5)
waitSeconds = CLng(WScript.Arguments(6))
Set s = Nothing
screens = ""
Set fso = CreateObject("Scripting.FileSystemObject")
If Err.Number <> 0 Then Err.Clear : Finish False, "arguments"
If Len(docNo) < 9 Or Len(year) <> 4 Or Len(reference) = 0 Then Finish False, "arguments"
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
OpenSession

s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMI02"
s.findById("wnd[0]").sendVKey 0
WaitIdle
If Err.Number <> 0 Or s.Info.Transaction <> "MI02" Then Err.Clear : Finish False, "no-access-mi02"
s.findById("wnd[0]/usr/ctxtRM07I-IBLNR").Text = docNo
s.findById("wnd[0]/usr/txtRM07I-GJAHR").Text = year
s.findById("wnd[0]/tbar[1]/btn[16]").press
WaitIdle
If CStr(s.Info.ScreenNumber) <> "790" Then Err.Clear : Finish False, "sap: " & s.findById("wnd[0]/sbar").Text
' Only CountPoint's own document, and only while nothing is counted or posted on it.
If UCase(Trim(s.findById("wnd[0]/usr/txtIKPF-INVNU").Text)) <> reference Then Finish False, "not-countpoint-document"
If Len(Trim(s.findById("wnd[0]/usr/txtIKPF-ZSTAT").Text)) > 0 Or Len(Trim(s.findById("wnd[0]/usr/txtIKPF-DSTAT").Text)) > 0 Then Finish False, "already-counted"
If Len(Trim(s.findById("wnd[0]/usr/txtIKPF-LSTAT").Text)) > 0 Then Finish False, "already-deleted"
If Err.Number <> 0 Then Err.Clear : Finish False, "mi02-screen-changed"

' Delete is only possible from the initial screen (waste bin, Shift+F2): back there with the document filled in.
s.findById("wnd[0]").sendVKey 3
WaitIdle
If CStr(s.Info.ScreenNumber) <> "701" Then Err.Clear : Finish False, "mi02-screen-changed"
s.findById("wnd[0]/usr/ctxtRM07I-IBLNR").Text = docNo
s.findById("wnd[0]/usr/txtRM07I-GJAHR").Text = year
s.findById("wnd[0]/sbar").Text = ""
Err.Clear

' Hand over: the user presses the waste bin and confirms. Every screen change is logged.
s.findById("wnd[0]").Restore
s.findById("wnd[0]").SetFocus
last = s.Info.Program & "/" & s.Info.ScreenNumber & "/" & s.Children.Count
screens = last
leftHeader = False
For i = 1 To waitSeconds * 2
  WScript.Sleep 500
  If Not SessionOpen() Then Set s = Nothing : Exit For
  If Not s.Busy Then
    current = s.Info.Program & "/" & s.Info.ScreenNumber & "/" & s.Children.Count
    message = s.findById("wnd[0]/sbar").Text
    If current <> last Then
      screens = screens & " > " & current & " [" & message & "]"
      last = current
      leftHeader = True
    End If
    ' Back on the initial screen without a popup, with SAP's message: done.
    If s.Children.Count = 1 And Len(message) > 0 Then screens = screens & " [" & message & "]" : Exit For
  End If
  Err.Clear
Next
If i > waitSeconds * 2 Then Finish False, "timeout"
If s Is Nothing Then OpenSession

' The document's status in MI22 (display only).
Err.Clear
s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMI22"
s.findById("wnd[0]").sendVKey 0
WaitIdle
s.findById("wnd[0]/usr/ctxtIM_MATNR-LOW").Text = ""
s.findById("wnd[0]/usr/ctxtIM_WERKS-LOW").Text = PLANT
s.findById("wnd[0]/usr/ctxtIM_LGORT-LOW").Text = ""
s.findById("wnd[0]/usr/txtIM_IBLNR-LOW").Text = docNo
s.findById("wnd[0]/usr/ctxtIM_INVNU-LOW").Text = ""
s.findById("wnd[0]/usr/ctxtPA_VARI").Text = ""
If Err.Number <> 0 Then Err.Clear : Finish False, "mi22-screen-changed"
s.findById("wnd[0]").sendVKey 8
WaitIdle
If CStr(s.Info.ScreenNumber) = "1000" Then Err.Clear : Finish True, message
If Not SaveList(statusFile) Then Err.Clear : Finish False, "read-failed"
Finish True, message
