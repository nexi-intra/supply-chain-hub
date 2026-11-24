' CountPoint - print a physical inventory document with MI21 (prints once the user presses Print).
' Usage: pidoc-print.vbs <system> <docNo> <year> <sloc> <printNow 0|1> <waitSeconds>
' Opens its OWN session on the connection to <system> (refuses any other system), fills MI21, opens the print dialog
' (F8 only opens the dialog), sets the output device DK_EN1_WHL4 and "Print Now", and WAITS for the user to press Print.
' Output: {"ok":true,"message":"<status bar>"} or {"ok":false,"error":"..."}.
Option Explicit
On Error Resume Next

Const PLANT = "D301"
Const PRINTER = "DK_EN1_WHL4"
Dim systemName, docNo, year, sloc, printNow, waitSeconds, app, conn, base, s, i, before, beforeIds, ownId, message, client

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
    WScript.StdOut.WriteLine "{""ok"":true,""message"":" & JsonText(text) & "}"
  Else
    WScript.StdOut.WriteLine "{""ok"":false,""error"":" & JsonText(text) & "}"
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
  Dim k
  SessionOpen = False
  Err.Clear
  For k = 0 To conn.Children.Count - 1
    If conn.Children(CInt(k)).Id = ownId Then SessionOpen = True
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
  If UCase(Trim(s.findById(path).Text)) <> UCase(expected) Then Finish False, "field-not-set: " & path
End Sub

Sub SetFields(names, value)
  Dim name
  For Each name In names
    s.findById("wnd[0]/usr/" & name).Text = value
  Next
End Sub

systemName = WScript.Arguments(0)
docNo = WScript.Arguments(1)
year = WScript.Arguments(2)
sloc = UCase(WScript.Arguments(3))
printNow = (WScript.Arguments(4) = "1")
waitSeconds = CLng(WScript.Arguments(5))
Set s = Nothing
If Err.Number <> 0 Then Err.Clear : Finish False, "arguments"
client = CreateObject("WScript.Shell").Environment("PROCESS")("COUNTPOINT_SAP_CLIENT")
If Len(client) = 0 Then Finish False, "arguments"
If Len(docNo) < 9 Or Len(docNo) > 10 Or Len(year) <> 4 Or Len(sloc) <> 4 Then Finish False, "arguments"

Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-not-running"
Set conn = Nothing
For i = 0 To app.Children.Count - 1
  If app.Children(CInt(i)).Children.Count > 0 Then
    If app.Children(CInt(i)).Children(0).Info.SystemName = systemName And app.Children(CInt(i)).Children(0).Info.Client = client Then Set conn = app.Children(CInt(i)) : Exit For
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
For i = 1 To 300
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
If s.Info.SystemName <> systemName Or s.Info.Client <> client Then Finish False, "wrong-system"
Err.Clear
' SAP's answer after Print ("cancel" when the user cancels) is read in English; another logon language could show a
' cancelled print as printed, so nothing is filled unless the session is in English.
Dim logonLanguage
logonLanguage = ""
logonLanguage = UCase(Trim(CStr(s.Info.Language)))
Err.Clear
If logonLanguage <> "EN" And logonLanguage <> "E" Then Finish False, "language-not-supported"

s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMI21"
s.findById("wnd[0]").sendVKey 0
WaitIdle
If Err.Number <> 0 Or s.Info.Transaction <> "MI21" Then Err.Clear : Finish False, "no-access-mi21"
SetFields Array("txtR_IBLNR-HIGH", "txtR_GJAHR-HIGH", "ctxtR_WERKS-HIGH", "ctxtR_LGORT-HIGH", "ctxtR_GIDAT-LOW", "ctxtR_GIDAT-HIGH", _
  "ctxtR_INVNU-LOW", "ctxtR_INVNU-HIGH", "txtR_XBLNI-LOW", "txtR_XBLNI-HIGH", "ctxtR_MATKL-LOW", "ctxtR_MATKL-HIGH", "txtR_LGPBE-LOW", "txtR_LGPBE-HIGH"), ""
s.findById("wnd[0]/usr/txtR_IBLNR-LOW").Text = docNo
s.findById("wnd[0]/usr/txtR_GJAHR-LOW").Text = year
s.findById("wnd[0]/usr/ctxtR_WERKS-LOW").Text = PLANT
s.findById("wnd[0]/usr/ctxtR_LGORT-LOW").Text = sloc
s.findById("wnd[0]/usr/txtTDDEST").Text = PRINTER
If Err.Number <> 0 Then Err.Clear : Finish False, "mi21-screen-changed"
Check "wnd[0]/usr/txtR_IBLNR-LOW", docNo
' F8 only opens the print dialog.
s.findById("wnd[0]").sendVKey 8
WaitIdle
If s.Children.Count < 2 Then Finish False, "sap: " & s.findById("wnd[0]/sbar").Text
s.findById("wnd[1]/usr/ctxtITCPP-TDDEST").Text = PRINTER
s.findById("wnd[1]/usr/chkITCPP-TDIMMED").Selected = printNow
If Err.Number <> 0 Then Err.Clear : Finish False, "print-dialog-changed"
Check "wnd[1]/usr/ctxtITCPP-TDDEST", PRINTER
If s.findById("wnd[1]/usr/chkITCPP-TDIMMED").Selected <> printNow Then Finish False, "field-not-set: TDIMMED"

' Hand over to the user: Print (Ctrl+P) or Cancel.
s.findById("wnd[0]").Restore
s.findById("wnd[1]").SetFocus
Err.Clear
WScript.StdOut.WriteLine "{""stage"":""waiting""}"
For i = 1 To waitSeconds * 2
  WScript.Sleep 500
  If Not SessionOpen() Then Set s = Nothing : Finish False, "cancelled"
  If Not s.Busy Then
    If s.Children.Count = 1 Then Exit For
  End If
  Err.Clear
Next
If i > waitSeconds * 2 Then Finish False, "timeout"
WaitIdle
message = s.findById("wnd[0]/sbar").Text
If InStr(1, message, "cancel", vbTextCompare) > 0 Then Finish False, "cancelled"
If s.findById("wnd[0]/sbar").MessageType = "E" Then Finish False, "sap: " & message
Finish True, message
