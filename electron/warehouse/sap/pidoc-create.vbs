' CountPoint - create a physical inventory document in MI31 (CHANGES SAP once the user presses F8).
' Usage: pidoc-create.vbs <system> <mode> <sloc> <stockType> <reference> <outDir> <outFile> <waitSeconds> <material> [clipboard]
'   <mode> test   = "Select Data and Issue Log": creates NOTHING; the script presses F8 itself and saves the log.
'          create = "Create Documents Directly": the script WAITS for the user to press F8, then saves the MI22 list of
'                   the new documents (found by <reference>).
'   <reference> (max 16, unique) goes into Physical Inventory Number + Reference, so the documents can be found in MI22.
'   stockType = unrestricted | blocked. With "clipboard" CountPoint has put all materials on the clipboard (one per line)
'   and <material> is the first of them, used to check the upload.
' Opens its OWN session on the connection to <system> (refuses any other system), fills MI31 exactly like the guide and
' WAITS for the user to press F8. Never presses F8 itself. Then saves the MI22 list of the new documents (%pc) as text.
' When the user closes the window instead (or later, before the answer), a fresh session on the same connection looks the
' reference up in MI22 (display only). The list is saved and the answer carries "closed":true and busySeen (SAP seen
' working: busy, out of the selection screen, F8, or state unreadable after the hand-over); SAP shows an empty list when
' nothing has the reference, and the app makes that "cancelled" (never seen working) or unknown. Should MI22 stay on its
' selection screen instead, the answer is "closed-unknown" (seen working) or "cancelled".
' No F8 by the time limit is "timeout" only when SAP was never seen working; otherwise MI22 decides the same way
' ("timedOut":true and busySeen; "timeout-unknown" when MI22 stays on its selection screen).
' Output: {"ok":true,"title":"..."[,"closed":true|"timedOut":true,"busySeen":...]} or {"ok":false,"error":"..."}.
Option Explicit
On Error Resume Next

Const PLANT = "D301"
Dim systemName, mode, sloc, stockType, reference, outDir, outFile, waitSeconds, material, fromClipboard, client
Dim app, conn, base, s, i, before, beforeIds, fso, ownId, title
Dim busySeen, busyNow, transactionNow, screenNow, windowsNow, openingFresh, handedOver, freshTried, lookedUp

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
  ' Always answers: called from ReadCreated too, where an error closing the session must not skip the answer.
  On Error Resume Next
  ' After the hand-over the user may have pressed F8 before closing the window: a failure on a closed window is looked
  ' up in MI22 in a fresh session first (once; that lookup ends with its own answer).
  If Not ok And handedOver And Not freshTried Then
    If Not SessionOpen() Then LookUpClosed
  End If
  CloseOwnSession
  ' A closed window's fresh session that cannot be opened or used (another system) is as good as none.
  If openingFresh And Not ok Then message = ClosedAnswer()
  If ok Then
    WScript.StdOut.WriteLine "{""ok"":true,""title"":" & JsonText(title) & LookupTail() & "}"
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

' Whether CountPoint's own session (ownId) is still open. Other SAP jobs open and close sessions on the same connection
' meanwhile, so the list can change while it is read: a pass that fails or sees the count change is repeated (three
' times at most), and "closed" needs a clean pass without ownId, confirmed by a second one 300 ms later.
Function SessionOpen()
  On Error Resume Next
  Dim attempt, total, after, k, id, found, misses
  SessionOpen = True
  misses = 0
  For attempt = 1 To 4
    Err.Clear
    found = False
    total = -1
    after = -2
    total = conn.Children.Count
    For k = 0 To total - 1
      id = ""
      id = CStr(conn.Children(CInt(k)).Id)
      If id = ownId Then found = True
    Next
    after = conn.Children.Count
    If Err.Number <> 0 Or after <> total Then
      Err.Clear
      WScript.Sleep 100
    ElseIf found Then
      Exit Function
    Else
      misses = misses + 1
      If misses = 2 Then SessionOpen = False : Exit Function
      WScript.Sleep 300
    End If
  Next
  SessionOpen = (misses = 0)
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

' The classic result list via "Save list in file" (%pc) as tab-separated UTF-8 text.
Function SaveList()
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
  s.findById("wnd[1]/usr/ctxtDY_FILENAME").Text = outFile
  s.findById("wnd[1]/usr/ctxtDY_FILE_ENCODING").Text = "4110"
  s.findById("wnd[1]/tbar[0]/btn[11]").press
  WaitIdle
  If Err.Number <> 0 Then Exit Function
  SaveList = fso.FileExists(outDir & "\" & outFile)
End Function

' The answer for a closed window when MI22 lists nothing (or cannot be read): SAP may still be creating once the session
' was seen busy or out of MI31 while waiting; otherwise F8 was never pressed.
Function ClosedAnswer()
  ClosedAnswer = "cancelled"
  If busySeen Then ClosedAnswer = "closed-unknown"
End Function

' After a closed window or the time limit MI22 decides. SAP shows an empty list when nothing has the reference (it does
' not stay on screen 1000), so the ok answer says which lookup it was and whether SAP was seen working: the app makes an
' empty list "cancelled"/"timeout" or unknown from that.
Function LookupTail()
  LookupTail = ""
  If lookedUp = "closed" Then LookupTail = ",""closed"":true"
  If lookedUp = "timeout" Then LookupTail = ",""timedOut"":true"
  If Len(LookupTail) = 0 Then Exit Function
  If busySeen Then LookupTail = LookupTail & ",""busySeen"":true" Else LookupTail = LookupTail & ",""busySeen"":false"
End Function

' The created documents, found by the Physical Inventory Number CountPoint stamped on them (read only). Ends the run:
' the list is saved, or <notFound> is the answer when MI22 lists none.
Sub ReadCreated(notFound)
  On Error Resume Next
  Dim screen
  Err.Clear
  s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMI22"
  s.findById("wnd[0]").sendVKey 0
  WaitIdle
  If s.Info.Transaction <> "MI22" Then Err.Clear : Finish False, "no-access-mi22"
  SetFields Array("ctxtIM_MATNR-LOW", "ctxtIM_MATNR-HIGH", "ctxtIM_WERKS-HIGH", "ctxtIM_LGORT-HIGH", "ctxtIM_CHARG-LOW", "txtIM_IBLNR-LOW", "txtIM_IBLNR-HIGH", _
    "ctxtIM_INVNU-HIGH", "ctxtZLDAT-LOW", "ctxtZLDAT-HIGH", "ctxtGIDAT-LOW", "ctxtGIDAT-HIGH", "txtBUCHP-LOW", "txtBUCHP-HIGH", "ctxtPA_VARI"), ""
  s.findById("wnd[0]/usr/ctxtIM_WERKS-LOW").Text = PLANT
  s.findById("wnd[0]/usr/ctxtIM_LGORT-LOW").Text = sloc
  s.findById("wnd[0]/usr/ctxtIM_INVNU-LOW").Text = reference
  If Err.Number <> 0 Then Err.Clear : Finish False, "mi22-screen-changed"
  Check "wnd[0]/usr/ctxtIM_INVNU-LOW", reference
  s.findById("wnd[0]").sendVKey 8
  WaitIdle
  ' Only a screen that was really read counts as "nothing listed" (an error in an If condition runs its Then branch).
  screen = ""
  Err.Clear
  screen = CStr(s.Info.ScreenNumber)
  If Err.Number <> 0 Then Err.Clear : Finish False, "read-failed"
  If screen = "1000" Then Finish False, notFound
  If Not SaveList() Then Err.Clear : Finish False, "read-failed"
  Finish True, ""
End Sub

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

' The user closed the window after the hand-over, maybe after F8 while SAP was still creating: a fresh session on the
' same connection looks the reference up in MI22 (display only), as pidoc-post.vbs does after a closed window. Any
' failure before MI22 is reached is ClosedAnswer() (openingFresh in Finish).
Sub LookUpClosed()
  On Error Resume Next
  freshTried = True
  openingFresh = True
  OpenOwnSession
  openingFresh = False
  lookedUp = "closed"
  ReadCreated ClosedAnswer()
End Sub

' No F8 seen by the time limit. SAP never seen working: F8 was not pressed, nothing is created ("timeout"). Seen working
' (F8 maybe pressed just before the limit): once SAP is idle, F8 seen now goes on as usual (title and MI22); otherwise
' open popups are cancelled (nothing is saved by that) and MI22 decides: documents listed are created, none is
' "timeout-unknown" (SAP may still be creating). A window closed meanwhile is looked up like any closed window.
Sub AfterTimeout()
  On Error Resume Next
  If Not busySeen Then Finish False, "timeout"
  WaitIdle
  If Not SessionOpen() Then LookUpClosed
  If F8Pressed() Then Exit Sub
  ClosePopups
  lookedUp = "timeout"
  ReadCreated "timeout-unknown"
End Sub

' The wait's F8 condition (MI31's selection screen gone without a popup), read into variables first: anything
' unreadable is not F8 (under On Error Resume Next an error in an If condition would run the Then branch).
Function F8Pressed()
  On Error Resume Next
  Dim transactionRead, screenRead, windowsRead
  F8Pressed = False
  transactionRead = ""
  screenRead = ""
  windowsRead = 0
  Err.Clear
  transactionRead = CStr(s.Info.Transaction)
  screenRead = CStr(s.Info.ScreenNumber)
  windowsRead = s.Children.Count
  If Err.Number <> 0 Then Err.Clear : Exit Function
  F8Pressed = (windowsRead = 1 And (screenRead <> "1000" Or transactionRead <> "MI31"))
End Function

' Cancels open popups (F12); nothing is saved by that.
Sub ClosePopups()
  On Error Resume Next
  Err.Clear
  Do While s.Children.Count > 1
    s.findById("wnd[" & (s.Children.Count - 1) & "]").sendVKey 12
    WaitIdle
    If Err.Number <> 0 Then Exit Do
  Loop
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

systemName = WScript.Arguments(0)
mode = LCase(WScript.Arguments(1))
sloc = UCase(WScript.Arguments(2))
stockType = LCase(WScript.Arguments(3))
reference = UCase(WScript.Arguments(4))
outDir = WScript.Arguments(5)
outFile = WScript.Arguments(6)
waitSeconds = CLng(WScript.Arguments(7))
material = UCase(Trim(WScript.Arguments(8)))
fromClipboard = (WScript.Arguments.Count > 9)
Set s = Nothing
title = ""
busySeen = False
openingFresh = False
handedOver = False
freshTried = False
lookedUp = ""
Set fso = CreateObject("Scripting.FileSystemObject")
If Err.Number <> 0 Then Err.Clear : Finish False, "arguments"
client = CreateObject("WScript.Shell").Environment("PROCESS")("COUNTPOINT_SAP_CLIENT")
If Len(client) = 0 Then Finish False, "arguments"
If mode <> "test" And mode <> "create" Then Finish False, "invalid-mode"
If stockType <> "unrestricted" And stockType <> "blocked" Then Finish False, "invalid-stock-type"
If Len(sloc) <> 4 Or Len(material) = 0 Or Len(reference) = 0 Or Len(reference) > 16 Then Finish False, "arguments"
If Not fso.FolderExists(outDir) Then Finish False, "out-dir-missing"
If fso.FileExists(outDir & "\" & outFile) Then fso.DeleteFile outDir & "\" & outFile

Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-not-running"
' Only a connection to the requested system; never the first one that happens to be open.
Set conn = Nothing
Set conn = SystemConnection(app, systemName, client)
Err.Clear
If conn Is Nothing Then Finish False, "not-logged-in-" & systemName
OpenOwnSession
' The window title ("Created") and the MI22 list are read in English; another logon language could hide a created
' document, so nothing is filled unless the session is in English.
Dim logonLanguage
logonLanguage = ""
logonLanguage = UCase(Trim(CStr(s.Info.Language)))
Err.Clear
If logonLanguage <> "EN" And logonLanguage <> "E" Then Finish False, "language-not-supported"

s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMI31"
s.findById("wnd[0]").sendVKey 0
WaitIdle
If Err.Number <> 0 Or s.Info.Transaction <> "MI31" Then Err.Clear : Finish False, "no-access-mi31"

' Every field that matters is set explicitly (SAP pre-fills from the user's parameter memory).
s.findById("wnd[0]/usr/ctxtR_MATNR-LOW").Text = ""
s.findById("wnd[0]/usr/ctxtR_MATNR-HIGH").Text = ""
If fromClipboard Then
  s.findById("wnd[0]/usr/btn%_R_MATNR_%_APP_%-VALU_PUSH").press
  WaitIdle
  s.findById("wnd[1]/tbar[0]/btn[16]").press
  WaitIdle
  s.findById("wnd[1]/tbar[0]/btn[24]").press
  WaitIdle
  s.findById("wnd[1]/tbar[0]/btn[8]").press
  WaitIdle
  If Err.Number <> 0 Then Err.Clear : Finish False, "multiple-selection-failed"
Else
  s.findById("wnd[0]/usr/ctxtR_MATNR-LOW").Text = material
End If
s.findById("wnd[0]/usr/ctxtR_WERKS-LOW").Text = PLANT
s.findById("wnd[0]/usr/ctxtR_WERKS-HIGH").Text = ""
s.findById("wnd[0]/usr/ctxtR_LGORT-LOW").Text = sloc
s.findById("wnd[0]/usr/ctxtR_LGORT-HIGH").Text = ""
s.findById("wnd[0]/usr/ctxtR_MTART-LOW").Text = ""
s.findById("wnd[0]/usr/ctxtR_MATKL-LOW").Text = ""
s.findById("wnd[0]/usr/txtR_LGPBE-LOW").Text = ""
s.findById("wnd[0]/usr/chkXDELE").Selected = True
If mode = "test" Then
  s.findById("wnd[0]/usr/radXTEST").Select
Else
  s.findById("wnd[0]/usr/radCALL_FB").Select
End If
s.findById("wnd[0]/usr/chkXPROT").Selected = True
s.findById("wnd[0]/usr/txtMAXPO").Text = "20"
s.findById("wnd[0]/usr/txtANZIV").Text = ""
s.findById("wnd[0]/usr/txtSWBST").Text = ""
s.findById("wnd[0]/usr/txtSWBSTW").Text = ""
s.findById("wnd[0]/usr/chkXNULB").Selected = False
s.findById("wnd[0]/usr/chkXONUL").Selected = True
s.findById("wnd[0]/usr/chkXNEGB").Selected = False
s.findById("wnd[0]/usr/chkXLABST").Selected = (stockType = "unrestricted")
s.findById("wnd[0]/usr/chkXINSME").Selected = False
s.findById("wnd[0]/usr/chkXSPEME").Selected = (stockType = "blocked")
s.findById("wnd[0]/usr/chkXWART").Selected = False
' Always: a material counted earlier in the year must still get a new document (the guide leaves this off).
s.findById("wnd[0]/usr/chkXIMAT").Selected = True
s.findById("wnd[0]/usr/chkXICHA").Selected = False
' The count is entered as today's SAP stock plus the approved difference, so the book stock must not be frozen at creation
' and the document must not block postings (both would otherwise come from the user's own SAP memory).
s.findById("wnd[0]/usr/chkXBUFI").Selected = False
s.findById("wnd[0]/usr/chkSPERR").Selected = False
s.findById("wnd[0]/usr/txtINVNU").Text = reference
s.findById("wnd[0]/usr/txtXBLNI").Text = reference
If Err.Number <> 0 Then Err.Clear : Finish False, "mi31-screen-changed"
Check "wnd[0]/usr/txtINVNU", reference
Check "wnd[0]/usr/ctxtR_MATNR-LOW", material
Check "wnd[0]/usr/ctxtR_WERKS-LOW", PLANT
Check "wnd[0]/usr/ctxtR_LGORT-LOW", sloc
If Not s.findById("wnd[0]/usr/chkXIMAT").Selected Then Finish False, "field-not-set: XIMAT"
If s.findById("wnd[0]/usr/chkXBUFI").Selected Then Finish False, "field-not-set: XBUFI"
If s.findById("wnd[0]/usr/chkSPERR").Selected Then Finish False, "field-not-set: SPERR"

If mode = "test" Then
  ' Only ever pressed in test mode, and only after confirming test mode is selected.
  If Not s.findById("wnd[0]/usr/radXTEST").Selected Or s.findById("wnd[0]/usr/radCALL_FB").Selected Then Finish False, "field-not-set: XTEST"
  s.findById("wnd[0]").sendVKey 8
  WaitIdle
  title = s.findById("wnd[0]").Text
  If CStr(s.Info.ScreenNumber) = "1000" Then Err.Clear : Finish False, "sap: " & s.findById("wnd[0]/sbar").Text
  If Not SaveList() Then Err.Clear : Finish False, "read-failed"
  Finish True, ""
End If
If Not s.findById("wnd[0]/usr/radCALL_FB").Selected Then Finish False, "field-not-set: CALL_FB"

' Hand over to the user: the session stays open and visible until F8 is pressed or the window is closed.
s.findById("wnd[0]").Restore
s.findById("wnd[0]").SetFocus
s.findById("wnd[0]/sbar").Text = ""
Err.Clear
handedOver = True
WScript.StdOut.WriteLine "{""stage"":""waiting""}"
For i = 1 To waitSeconds * 2
  WScript.Sleep 500
  If Not SessionOpen() Then Set s = Nothing : Exit For
  ' Remembered for a closed window: SAP may be working after F8 once the session was busy or out of MI31. Polling every
  ' 500 ms can miss that, so whatever cannot be read while the session is still open counts as working too.
  Err.Clear
  busyNow = True
  busyNow = s.Busy
  If Err.Number <> 0 Then
    Err.Clear
    If Not SessionOpen() Then Exit For
  End If
  If busyNow Then
    busySeen = True
  Else
    transactionNow = ""
    screenNow = ""
    windowsNow = 0
    transactionNow = CStr(s.Info.Transaction)
    screenNow = CStr(s.Info.ScreenNumber)
    windowsNow = s.Children.Count
    If Err.Number <> 0 Then
      Err.Clear
      If Not SessionOpen() Then Exit For
      busySeen = True
    ElseIf windowsNow = 1 And (screenNow <> "1000" Or transactionNow <> "MI31") Then
      ' Pressed F8 = the selection screen is gone without a popup (the multiple selection is a popup, not F8).
      busySeen = True
      Exit For
    ElseIf transactionNow <> "MI31" Then
      busySeen = True
    End If
  End If
  Err.Clear
Next
If Not SessionOpen() Then LookUpClosed
If i > waitSeconds * 2 Then AfterTimeout
WaitIdle
title = s.findById("wnd[0]").Text
If s.Info.Transaction <> "MI31" Then Finish False, "left-mi31"
If InStr(1, title, "Created", vbTextCompare) = 0 Then Finish False, "not-created: " & title & " " & s.findById("wnd[0]/sbar").Text
ReadCreated "created-but-not-found"

Sub SetFields(names, value)
  Dim name
  For Each name In names
    s.findById("wnd[0]/usr/" & name).Text = value
  Next
End Sub
