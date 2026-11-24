' CountPoint - SHOW a document in SAP (display only): MI03 (physical inventory document) or MB03 (material document).
' Usage: sap-show.vbs <system> <mi03|mb03> <docNo> <year>
' Opens a NEW session on <system>, shows the document and leaves the window open for the user. Changes nothing.
' Output: {"ok":true} or {"ok":false,"error":"..."}.
Option Explicit
On Error Resume Next

Dim systemName, kind, docNo, year, app, conn, base, s, i, before, beforeIds, client

Sub Finish(ok, text)
  If ok Then
    WScript.StdOut.WriteLine "{""ok"":true}"
  Else
    WScript.StdOut.WriteLine "{""ok"":false,""error"":""" & Replace(text, """", "'") & """}"
  End If
  WScript.Quit 0
End Sub

Sub WaitIdle()
  Dim n
  For n = 1 To 3000
    If Not s.Busy Then Exit Sub
    WScript.Sleep 100
  Next
End Sub

' Whether connection c is on <wantedSystem> in <wantedClient>. Its details are read here only: one that cannot be read
' never matches (under On Error Resume Next an error in an If condition would run the Then branch).
Function ConnectionMatches(c, wantedSystem, wantedClient)
  On Error Resume Next
  Dim n, sys, cl
  ConnectionMatches = False
  n = 0
  sys = ""
  cl = ""
  Err.Clear
  n = c.Children.Count
  If Err.Number <> 0 Or n = 0 Then Err.Clear : Exit Function
  sys = CStr(c.Children(0).Info.SystemName)
  cl = CStr(c.Children(0).Info.Client)
  If Err.Number <> 0 Then Err.Clear : Exit Function
  ConnectionMatches = (sys = wantedSystem And cl = wantedClient)
End Function

' The first connection to <wantedSystem> in <wantedClient>; never another system or client.
Function SystemConnection(engine, wantedSystem, wantedClient)
  On Error Resume Next
  Dim n, total, candidate
  Set SystemConnection = Nothing
  total = 0
  total = engine.Children.Count
  For n = 0 To total - 1
    Set candidate = Nothing
    Set candidate = engine.Children(CInt(n))
    If ConnectionMatches(candidate, wantedSystem, wantedClient) Then Set SystemConnection = candidate : Exit Function
  Next
  Err.Clear
End Function

systemName = WScript.Arguments(0)
kind = LCase(WScript.Arguments(1))
docNo = WScript.Arguments(2)
year = WScript.Arguments(3)
If Err.Number <> 0 Then Err.Clear : Finish False, "arguments"
client = CreateObject("WScript.Shell").Environment("PROCESS")("COUNTPOINT_SAP_CLIENT")
If Len(client) = 0 Then Finish False, "arguments"
If (kind <> "mi03" And kind <> "mb03") Or Len(docNo) < 9 Or Len(year) <> 4 Then Finish False, "arguments"

Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-not-running"
Set conn = Nothing
Set conn = SystemConnection(app, systemName, client)
Err.Clear
If conn Is Nothing Then Finish False, "not-logged-in-" & systemName
Set base = Nothing
For i = 0 To conn.Children.Count - 1
  If Not conn.Children(CInt(i)).Busy Then Set base = conn.Children(CInt(i)) : Exit For
Next
If base Is Nothing Then Finish False, "sap-busy"
If conn.Children.Count >= 6 Then Finish False, "max-sessions"
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
Set s = Nothing
For i = 0 To conn.Children.Count - 1
  If InStr(beforeIds, "|" & conn.Children(CInt(i)).Id & "|") = 0 Then Set s = conn.Children(CInt(i))
Next
If s Is Nothing Then Err.Clear : Finish False, "session-not-created"
WaitIdle
If s.Info.SystemName <> systemName Or s.Info.Client <> client Then Finish False, "wrong-system"
Err.Clear

If kind = "mi03" Then
  s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMI03"
  s.findById("wnd[0]").sendVKey 0
  WaitIdle
  If s.Info.Transaction <> "MI03" Then Err.Clear : Finish False, "no-access-mi03"
  s.findById("wnd[0]/usr/ctxtRM07I-IBLNR").Text = docNo
  s.findById("wnd[0]/usr/txtRM07I-GJAHR").Text = year
  ' Overview: all items with book and counted quantities.
  s.findById("wnd[0]").sendVKey 5
Else
  ' MB03 forwards to MIGO, which remembers the user's last action: set "A04 Display" + "R02 Material Document" explicitly.
  Dim w
  s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMIGO"
  s.findById("wnd[0]").sendVKey 0
  WaitIdle
  If s.Info.Transaction <> "MIGO" Then Err.Clear : Finish False, "no-access-migo"
  Set w = s.findById("wnd[0]")
  w.FindByName("GODYNPRO-ACTION", "GuiComboBox").Key = "A04"
  WaitIdle
  w.FindByName("GODYNPRO-REFDOC", "GuiComboBox").Key = "R02"
  WaitIdle
  If w.FindByName("GODYNPRO-ACTION", "GuiComboBox").Key <> "A04" Then Finish False, "migo-not-display"
  w.FindByName("GODYNPRO-MAT_DOC", "GuiTextField").Text = docNo
  w.FindByName("GODYNPRO-DOC_YEAR", "GuiTextField").Text = year
  w.FindByName("OK_GO", "GuiButton").press
End If
WaitIdle
If Err.Number <> 0 Then Err.Clear : Finish False, "screen-changed"
If s.findById("wnd[0]/sbar").MessageType = "E" Then Finish False, "sap: " & s.findById("wnd[0]/sbar").Text
s.findById("wnd[0]").Restore
s.findById("wnd[0]").SetFocus
Finish True, ""
