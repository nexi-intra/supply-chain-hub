' CountPoint - "Tjek i SAP": what SAP has for a PI document whose state CountPoint does not know. READ ONLY.
' Usage: pidoc-check.vbs <outDir> <mi22File> <mi20File> <year> <reference> <docNo|->
' Opens its OWN session on the connection to the system CountPoint is set to (COUNTPOINT_SAP_SYSTEM) in the client it
' expects (COUNTPOINT_SAP_CLIENT); never another system or client. Saves the MI22 list of the documents with <reference>
' (plant D301) to <mi22File> and, unless <docNo> is "-", the MI20 list of <docNo> (plant D301, <year>) to <mi20File>.
' F8 only executes these display lists: nothing in MI20 is ticked, posted or saved. Nobody waits for the user, and the
' session is closed at the end. A list SAP has nothing for gives no file and "empty": it stays on selection screen 1000
' with an S or I message, which is returned (mi22Message, mi20Message: "<type>: <text>"). Screen 1000 with any other
' message (W, E, A, none, unreadable) is SAP refusing or stopping the selection, never "nothing listed": "list-error: ...".
' Output: {"ok":true,"mi22":"saved|empty","mi20":"saved|empty|skipped","mi22Message":"...","mi20Message":"..."} or
' {"ok":false,"error":"..."}.
Option Explicit
On Error Resume Next

Const PLANT = "D301"
Dim systemName, client, outDir, mi22File, mi20File, year, reference, docNo
Dim app, conn, base, s, before, beforeIds, ownId, fso, mi22, mi20, mi22Message, mi20Message, listMessage

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
  On Error Resume Next
  CloseOwnSession
  If ok Then
    WScript.StdOut.WriteLine "{""ok"":true,""mi22"":" & JsonText(mi22) & ",""mi20"":" & JsonText(mi20) & ",""mi22Message"":" & JsonText(mi22Message) & ",""mi20Message"":" & JsonText(mi20Message) & "}"
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

Function SessionOpen()
  Dim k
  SessionOpen = False
  Err.Clear
  For k = 0 To conn.Children.Count - 1
    If conn.Children(CInt(k)).Id = ownId Then SessionOpen = True
  Next
  Err.Clear
End Function

' Cancels open popups (F12); nothing is saved by that.
Sub ClosePopups()
  Err.Clear
  Do While s.Children.Count > 1
    s.findById("wnd[" & (s.Children.Count - 1) & "]").sendVKey 12
    WaitIdle
    If Err.Number <> 0 Then Exit Do
  Loop
  Err.Clear
End Sub

Sub CloseOwnSession()
  Dim n
  If s Is Nothing Then Exit Sub
  If Not SessionOpen() Then Set s = Nothing : Exit Sub
  ClosePopups
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

' The classic result list via "Save list in file" (%pc) as tab-separated UTF-8 text.
Function SaveList(file)
  Dim k, radio, chosen
  SaveList = False
  chosen = False
  s.findById("wnd[0]/tbar[0]/okcd").Text = "%pc"
  s.findById("wnd[0]").sendVKey 0
  WaitIdle
  For k = 0 To 9
    Set radio = s.findById("wnd[1]/usr/subSUBSCREEN_STEPLOOP:SAPLSPO5:0150/sub:SAPLSPO5:0150/radSPOPLI-SELFLAG[" & k & ",0]")
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

' The text of the open popup, "" when none is open, "(popup)" when one is open but its text cannot be read.
Function PopupText()
  On Error Resume Next
  Dim n, t
  PopupText = ""
  n = 0
  Err.Clear
  n = s.Children.Count
  If Err.Number <> 0 Or n < 2 Then Err.Clear : Exit Function
  t = ""
  t = CStr(s.findById("wnd[" & (n - 1) & "]").PopupDialogText)
  If Err.Number <> 0 Or Len(Trim(t)) = 0 Then
    Err.Clear
    t = ""
    t = CStr(s.findById("wnd[" & (n - 1) & "]/usr/txtMESSTXT1").Text)
  End If
  If Err.Number <> 0 Then Err.Clear : t = ""
  t = Trim(t)
  If Len(t) = 0 Then t = "(popup)"
  PopupText = t
End Function

' Executes the filled display list (F8) and saves it to <file>: "saved", or "empty" when SAP lists nothing.
' SAP stays on selection screen 1000 both when it lists nothing and when it refuses the selection (e.g. no authorization
' for the plant) or stops F8 at a warning (W: the list never ran): only a status bar message read as S or I is "nothing
' listed" (listMessage keeps it). Anything else (W, E, A, no message, unreadable) ends the run with "list-error", so
' CountPoint never reads a refusal as "no document".
Function RunList(file)
  On Error Resume Next
  Dim screen, kind, text, popup
  listMessage = ""
  Err.Clear
  s.findById("wnd[0]").sendVKey 8
  WaitIdle
  ' Only a screen that was really read counts as "nothing listed" (an error in an If condition runs its Then branch).
  screen = ""
  screen = CStr(s.Info.ScreenNumber)
  If Err.Number <> 0 Then Err.Clear : Finish False, "read-failed"
  If screen = "1000" Then
    ' Read before any popup is cancelled: the message may be all SAP says.
    popup = PopupText()
    Err.Clear
    kind = ""
    text = ""
    kind = UCase(Trim(CStr(s.findById("wnd[0]/sbar").MessageType)))
    text = Trim(CStr(s.findById("wnd[0]/sbar").Text))
    If Err.Number <> 0 Then Err.Clear : kind = ""
    If Len(popup) > 0 Then text = Trim(text & " [" & popup & "]")
    listMessage = kind & ": " & text
    If kind <> "S" And kind <> "I" Then Finish False, "list-error: " & listMessage
    ClosePopups
    RunList = "empty"
    Exit Function
  End If
  If Not SaveList(file) Then Err.Clear : Finish False, "read-failed"
  RunList = "saved"
End Function

' A session that is not busy to open a new session from (base), and the sessions open before it (before, beforeIds).
Sub PrepareNewSession()
  On Error Resume Next
  Dim n
  Set base = Nothing
  For n = 0 To conn.Children.Count - 1
    If Not conn.Children(CInt(n)).Busy Then Set base = conn.Children(CInt(n)) : Exit For
  Next
  before = conn.Children.Count
  beforeIds = "|"
  For n = 0 To conn.Children.Count - 1
    beforeIds = beforeIds & conn.Children(CInt(n)).Id & "|"
  Next
  Err.Clear
End Sub

' Opens CountPoint's own session (s, ownId) on conn from a session that is not busy, and checks its system and client.
Sub OpenOwnSession()
  On Error Resume Next
  Dim i
  Set s = Nothing
  PrepareNewSession
  If base Is Nothing Then Finish False, "sap-busy"
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
  ' The session is tracked (and closed at the end) by its id: one whose id cannot be read is closed right away.
  Err.Clear
  ownId = ""
  ownId = CStr(s.Id)
  If Err.Number <> 0 Or Len(ownId) = 0 Then
    Err.Clear
    s.findById("wnd[0]/tbar[0]/okcd").Text = "/i"
    s.findById("wnd[0]").sendVKey 0
    Set s = Nothing
    Finish False, "session-not-created"
  End If
  WaitIdle
  If s.Info.SystemName <> systemName Or s.Info.Client <> client Then Finish False, "wrong-system"
  Err.Clear
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

Set s = Nothing
mi22 = ""
mi20 = "skipped"
mi22Message = ""
mi20Message = ""
If WScript.Arguments.Count < 6 Then Err.Clear : Finish False, "arguments"
systemName = CreateObject("WScript.Shell").Environment("PROCESS")("COUNTPOINT_SAP_SYSTEM")
If Len(systemName) = 0 Then Finish False, "arguments"
outDir = WScript.Arguments(0)
mi22File = WScript.Arguments(1)
mi20File = WScript.Arguments(2)
year = Trim(WScript.Arguments(3))
reference = UCase(Trim(WScript.Arguments(4)))
docNo = Trim(WScript.Arguments(5))
Set fso = CreateObject("Scripting.FileSystemObject")
If Err.Number <> 0 Then Err.Clear : Finish False, "arguments"
client = CreateObject("WScript.Shell").Environment("PROCESS")("COUNTPOINT_SAP_CLIENT")
If Len(client) = 0 Then Finish False, "arguments"
If Len(year) <> 4 Or Len(reference) = 0 Or Len(reference) > 16 Or Len(mi22File) = 0 Or Len(mi20File) = 0 Then Finish False, "arguments"
If docNo <> "-" And (Len(docNo) < 9 Or Len(docNo) > 10) Then Finish False, "arguments"
If Not fso.FolderExists(outDir) Then Finish False, "out-dir-missing"
If fso.FileExists(outDir & "\" & mi22File) Then fso.DeleteFile outDir & "\" & mi22File
If fso.FileExists(outDir & "\" & mi20File) Then fso.DeleteFile outDir & "\" & mi20File
Err.Clear

Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-not-running"
' Only a connection to the system and client CountPoint is set to; never the first one that happens to be open.
Set conn = Nothing
Set conn = SystemConnection(app, systemName, client)
Err.Clear
If conn Is Nothing Then Finish False, "not-logged-in-" & systemName
OpenOwnSession
s.findById("wnd[0]").Iconify
Err.Clear
' The lists ("Doc. Active", the columns) are read in English; another logon language could hide a document.
Dim logonLanguage
logonLanguage = ""
logonLanguage = UCase(Trim(CStr(s.Info.Language)))
Err.Clear
If logonLanguage <> "EN" And logonLanguage <> "E" Then Finish False, "language-not-supported"

' MI22: the documents CountPoint stamped with <reference> (display only).
s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMI22"
s.findById("wnd[0]").sendVKey 0
WaitIdle
If Err.Number <> 0 Or s.Info.Transaction <> "MI22" Then Err.Clear : Finish False, "no-access-mi22"
SetFields Array("ctxtIM_MATNR-LOW", "ctxtIM_MATNR-HIGH", "ctxtIM_WERKS-HIGH", "ctxtIM_LGORT-LOW", "ctxtIM_LGORT-HIGH", "ctxtIM_CHARG-LOW", "txtIM_IBLNR-LOW", "txtIM_IBLNR-HIGH", _
  "ctxtIM_INVNU-HIGH", "ctxtZLDAT-LOW", "ctxtZLDAT-HIGH", "ctxtGIDAT-LOW", "ctxtGIDAT-HIGH", "txtBUCHP-LOW", "txtBUCHP-HIGH", "ctxtPA_VARI"), ""
s.findById("wnd[0]/usr/ctxtIM_WERKS-LOW").Text = PLANT
s.findById("wnd[0]/usr/ctxtIM_INVNU-LOW").Text = reference
If Err.Number <> 0 Then Err.Clear : Finish False, "mi22-screen-changed"
Check "wnd[0]/usr/ctxtIM_INVNU-LOW", reference
Check "wnd[0]/usr/ctxtIM_WERKS-LOW", PLANT
mi22 = RunList(mi22File)
mi22Message = listMessage

' MI20: the counted items of <docNo>, listed only (never ticked, never "Post Difference").
If docNo <> "-" Then
  Err.Clear
  s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMI20"
  s.findById("wnd[0]").sendVKey 0
  WaitIdle
  If Err.Number <> 0 Or s.Info.Transaction <> "MI20" Then Err.Clear : Finish False, "no-access-mi20"
  SetFields Array("ctxtIM_MATNR-LOW", "ctxtIM_MATNR-HIGH", "ctxtIM_WERKS-HIGH", "ctxtIM_LGORT-LOW", "ctxtIM_LGORT-HIGH", "ctxtIM_CHARG-LOW", _
    "txtIM_IBLNR-LOW", "txtIM_IBLNR-HIGH", "ctxtIM_INVNU-LOW", "ctxtSOBKZ-LOW", "txtGJAHR-HIGH", "ctxtZLDAT-LOW", "ctxtZLDAT-HIGH", _
    "ctxtGIDAT-LOW", "ctxtGIDAT-HIGH", "txtXBLNI-LOW", "ctxtGRUND-LOW", "txtIIWERT", "ctxtP_VARI"), ""
  s.findById("wnd[0]/usr/txtIM_IBLNR-LOW").Text = docNo
  s.findById("wnd[0]/usr/ctxtIM_WERKS-LOW").Text = PLANT
  s.findById("wnd[0]/usr/txtGJAHR-LOW").Text = year
  s.findById("wnd[0]/usr/radP_LEINF").Select
  s.findById("wnd[0]/usr/chkP_ALVTR").Selected = False
  If Err.Number <> 0 Then Err.Clear : Finish False, "mi20-screen-changed"
  Check "wnd[0]/usr/txtIM_IBLNR-LOW", docNo
  Check "wnd[0]/usr/ctxtIM_WERKS-LOW", PLANT
  Check "wnd[0]/usr/txtGJAHR-LOW", year
  mi20 = RunList(mi20File)
  mi20Message = listMessage
End If
Finish True, ""
