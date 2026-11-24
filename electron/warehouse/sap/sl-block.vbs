' CountPoint - Softwareload: serial numbers of one material into blocked stock (344) or back (343) with MIGO, plant D301,
' storage location D000. CHANGES SAP: one material document.
' Usage: sl-block.vbs <system> <outDir> <inFile> <material> <344|343>
' The serials are in <inFile> (one per line). Opens its OWN session on <system> (refuses any other): MIGO Transfer
' Posting / Other, movement type, material, plant, location and quantity (read back after Enter: anything else gives
' screen-mismatch before Check), the serials in the Serial Numbers tab, Check (must say "Document is O.K."), Post.
' Output: {"ok":true,"doc":"<material document>"} or {"ok":false,"error":"sap: <SAP's message>"} or
' {"ok":false,"error":"language-not-supported"} (the session is not in English; nothing entered) or {"ok":false,"error":"..."}.
Option Explicit
On Error Resume Next

Const PLANT = "D301"
Const SLOC = "D000"
Const MAX_SERIALS = 50
Const ITEM_TABS = "/subSUB_ITEMDETAIL:SAPLMIGO:0303/subSUB_DETAIL:SAPLMIGO:0305/tabsTS_GOITEM"
Const TRANS_AREA = "/tabpOK_GOITEM_TRANS/ssubSUB_TS_GOITEM_TRANS:SAPLMIGO:0390"
Const SERIAL_TABLE = "/tabpOK_GOITEM_SERIAL/ssubSUB_TS_GOITEM_SERIAL:SAPLMIGO:0360/tblSAPLMIGOTV_GOSERIAL"
Dim systemName, outDir, inFile, material, bwart, app, conn, base, s, i, before, beforeIds, fso, ownId, doc, client
Dim serials, count, text, lines, value, re, carrier, firstLine, tabs, matches

Function JsonText(value)
  On Error Resume Next
  Dim t
  JsonText = """"""
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
    WScript.StdOut.WriteLine "{""ok"":true,""doc"":" & JsonText(doc) & "}"
  Else
    WScript.StdOut.WriteLine "{""ok"":false,""error"":" & JsonText(message) & "}"
  End If
  WScript.Quit 0
End Sub

Sub WaitIdle()
  On Error Resume Next
  Dim n
  For n = 1 To 3000
    If s Is Nothing Then Exit Sub
    If Not s.Busy Then Exit Sub
    WScript.Sleep 100
  Next
End Sub

Sub CloseOwnSession()
  On Error Resume Next
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

' Reads a text property; "" when it does not exist (an error inside an If condition would run the Then branch).
Function TextOf(path)
  On Error Resume Next
  TextOf = ""
  TextOf = CStr(s.findById(path).Text)
  Err.Clear
End Function

Function ComboKey(path)
  On Error Resume Next
  ComboKey = ""
  ComboKey = CStr(s.findById(path).Key)
  Err.Clear
End Function

Function PopupCount()
  On Error Resume Next
  PopupCount = -1
  PopupCount = s.Children.Count - 1
  Err.Clear
End Function

Function ScreenOf()
  On Error Resume Next
  ScreenOf = ""
  ScreenOf = s.Info.Program & "/" & s.Info.ScreenNumber
  Err.Clear
End Function

' MIGO's main subscreen: SAPLMIGO:0007 normally, 0003 when MIGO opens in Display. Found by name, not by number.
Function ChildPath(parentPath, fragment)
  On Error Resume Next
  Dim parent, k, id
  ChildPath = ""
  Set parent = s.findById(parentPath)
  If Err.Number <> 0 Then Err.Clear : Exit Function
  For k = 0 To parent.Children.Count - 1
    id = ""
    id = parent.Children(CInt(k)).Id
    If InStr(id, fragment) > 0 Then ChildPath = parentPath & Mid(id, InStrRev(id, "/")) : Exit Function
  Next
  Err.Clear
End Function

Sub FindCarrier()
  On Error Resume Next
  carrier = ChildPath("wnd[0]/usr", "ssubSUB_MAIN_CARRIER:SAPLMIGO:")
  If carrier = "" Then Finish False, "migo-screen-changed: " & ScreenOf()
  firstLine = ChildPath(carrier, "subSUB_FIRSTLINE:SAPLMIGO:")
  If firstLine = "" Then Finish False, "migo-screen-changed: " & ScreenOf()
  tabs = carrier & ITEM_TABS
End Sub

' MIGO's "Tip" box (SAPLMIGO 1300) is only information: Enter. Any other box stops the script.
Sub CloseTips()
  On Error Resume Next
  Dim n
  For n = 1 To 3
    If PopupCount() < 1 Then Exit Sub
    If ScreenOf() <> "SAPLMIGO/1300" Then Exit Sub
    s.findById("wnd[1]").sendVKey 0
    WaitIdle
  Next
  Err.Clear
End Sub

' After Check/Post: "The maximum amount of serial numbers is reached" (SAPLRHRD 100) is only information: Continue.
Sub ContinueSerialInfo()
  On Error Resume Next
  Dim n
  For n = 1 To 3
    If PopupCount() < 1 Then Exit Sub
    If ScreenOf() = "SAPLRHRD/100" Then
      s.findById("wnd[1]/usr/btnSPOP-OPTION1").press
      WaitIdle
    ElseIf ScreenOf() = "SAPLMIGO/1300" Then
      s.findById("wnd[1]").sendVKey 0
      WaitIdle
    Else
      Exit Sub
    End If
  Next
  Err.Clear
End Sub

Sub StopOnPopup(what)
  On Error Resume Next
  If PopupCount() <> 0 Then Finish False, "unexpected-popup-" & what & ": " & ScreenOf() & " " & TextOf("wnd[1]/usr/txtMESSTXT1") & TextOf("wnd[1]/usr/txtSPOP-TEXTLINE1")
End Sub

Sub StopOnError()
  On Error Resume Next
  Dim messageType
  messageType = ""
  messageType = s.findById("wnd[0]/sbar").MessageType
  Err.Clear
  If messageType = "E" Or messageType = "A" Then Finish False, "sap: " & TextOf("wnd[0]/sbar")
End Sub

' Whether one of the fields in <area> shows <expected>. MIGO may put a typed key's text in the field and show the key
' in a field of its own, so the key fields are listed too; a field that does not exist reads as "".
Function ShowsValue(area, fields, expected)
  On Error Resume Next
  Dim field, shown
  ShowsValue = False
  For Each field In fields
    shown = ""
    shown = UCase(Trim(TextOf(area & "/" & field)))
    If shown = UCase(expected) Then ShowsValue = True : Exit Function
  Next
End Function

' The whole number MIGO shows as quantity ("20", or "20.000"/"20,000" with decimals); -1 when it is anything else.
Function QuantityOf(value)
  On Error Resume Next
  Dim t, rx, found
  QuantityOf = -1
  t = Replace(Trim(CStr(value)), " ", "")
  Set rx = New RegExp
  rx.Pattern = "^(\d{1,6})([.,]0+)?$"
  If Not rx.Test(t) Then Exit Function
  Set found = rx.Execute(t)
  QuantityOf = CLng(found(0).SubMatches(0))
  If Err.Number <> 0 Then Err.Clear : QuantityOf = -1
End Function

Set s = Nothing
doc = ""
If WScript.Arguments.Count < 5 Then Err.Clear : Finish False, "arguments"
systemName = WScript.Arguments(0)
outDir = WScript.Arguments(1)
inFile = WScript.Arguments(2)
material = UCase(Trim(WScript.Arguments(3)))
bwart = Trim(WScript.Arguments(4))
Set fso = CreateObject("Scripting.FileSystemObject")
Set re = New RegExp
re.IgnoreCase = True
If Err.Number <> 0 Then Err.Clear : Finish False, "arguments"
client = CreateObject("WScript.Shell").Environment("PROCESS")("COUNTPOINT_SAP_CLIENT")
If Len(client) = 0 Then Finish False, "arguments"
If bwart <> "344" And bwart <> "343" Then Finish False, "movement-type-not-allowed"
If Len(material) = 0 Or Len(material) > 40 Then Finish False, "material-missing"
text = fso.OpenTextFile(outDir & "\" & inFile, 1).ReadAll
If Err.Number <> 0 Then Err.Clear : Finish False, "in-file-missing"
lines = Split(Replace(text, vbCr, ""), vbLf)
serials = Array()
count = 0
For i = 0 To UBound(lines)
  value = UCase(Trim(lines(i)))
  If Len(value) > 0 Then
    ReDim Preserve serials(count)
    serials(count) = value
    count = count + 1
  End If
Next
If count = 0 Then Finish False, "no-serials"
If count > MAX_SERIALS Then Finish False, "too-many-serials"
Err.Clear

Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-not-running"
Set conn = SystemConnection(app, systemName, client)
If conn Is Nothing Then Err.Clear : Finish False, "not-logged-in-" & systemName
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
If s.Info.SystemName <> systemName Or s.Info.Client <> client Then Err.Clear : Finish False, "wrong-system"
' "Document is O.K." and "Material document ... posted" are read in English; another logon language could hide a
' posted document, so nothing is entered unless the session is in English.
Dim logonLanguage
logonLanguage = ""
logonLanguage = UCase(Trim(CStr(s.Info.Language)))
Err.Clear
If logonLanguage <> "EN" And logonLanguage <> "E" Then Finish False, "language-not-supported"
s.findById("wnd[0]").Iconify
Err.Clear

s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMIGO"
s.findById("wnd[0]").sendVKey 0
WaitIdle
If Err.Number <> 0 Or s.Info.Transaction <> "MIGO" Then Err.Clear : Finish False, "no-access-migo"
CloseTips
StopOnPopup "open"

' 1. Transfer Posting (A08) / Other (R10), movement type, Enter, close the Tip box.
FindCarrier
If InStr(carrier, "SAPLMIGO:0003") > 0 Or ComboKey(firstLine & "/cmbGODYNPRO-ACTION") <> "A08" Then
  s.findById(firstLine & "/cmbGODYNPRO-ACTION").Key = "A08"
  WaitIdle
  If Err.Number <> 0 Then Err.Clear : Finish False, "migo-action-not-set"
  CloseTips
  FindCarrier
End If
If ComboKey(firstLine & "/cmbGODYNPRO-REFDOC") <> "R10" Then
  s.findById(firstLine & "/cmbGODYNPRO-REFDOC").Key = "R10"
  WaitIdle
  If Err.Number <> 0 Then Err.Clear : Finish False, "migo-action-not-set"
  CloseTips
  FindCarrier
End If
If ComboKey(firstLine & "/cmbGODYNPRO-ACTION") <> "A08" Or ComboKey(firstLine & "/cmbGODYNPRO-REFDOC") <> "R10" Then Finish False, "migo-action-not-set"
s.findById(firstLine & "/ctxtGODEFAULT_TV-BWART").Text = bwart
If Err.Number <> 0 Then Err.Clear : Finish False, "migo-screen-changed: BWART"
s.findById("wnd[0]").sendVKey 0
WaitIdle
Err.Clear
CloseTips
StopOnPopup "bwart"
StopOnError
FindCarrier
If TextOf(firstLine & "/ctxtGODEFAULT_TV-BWART") <> bwart Then Finish False, "migo-movement-type-not-set"

' 2. Transfer Posting tab: material, plant, location, quantity. Enter.
s.findById(tabs & "/tabpOK_GOITEM_TRANS").Select
WaitIdle
If Err.Number <> 0 Then Err.Clear : Finish False, "migo-screen-changed: TRANS"
FindCarrier
s.findById(tabs & TRANS_AREA & "/ctxtGODYNPRO-MAKTX").Text = material
s.findById(tabs & TRANS_AREA & "/ctxtGODYNPRO-NAME1").Text = PLANT
s.findById(tabs & TRANS_AREA & "/ctxtGODYNPRO-LGOBE").Text = SLOC
s.findById(tabs & TRANS_AREA & "/txtGODYNPRO-ERFMG").Text = CStr(count)
If Err.Number <> 0 Then Err.Clear : Finish False, "migo-screen-changed: item"
s.findById("wnd[0]").sendVKey 0
WaitIdle
Err.Clear
CloseTips
StopOnPopup "item"
StopOnError

' 2b. Read back what MIGO kept after Enter: material, D301, D000 and the quantity. Anything else stops before Check.
Dim keptMaterial, keptPlant, keptSloc, keptQuantity
FindCarrier
keptMaterial = ShowsValue(tabs & TRANS_AREA, Array("ctxtGODYNPRO-MAKTX", "ctxtGODYNPRO-MATNR", "txtGODYNPRO-MATNR"), material)
keptPlant = ShowsValue(tabs & TRANS_AREA, Array("ctxtGODYNPRO-NAME1", "ctxtGODYNPRO-WERKS", "txtGODYNPRO-WERKS"), PLANT)
keptSloc = ShowsValue(tabs & TRANS_AREA, Array("ctxtGODYNPRO-LGOBE", "ctxtGODYNPRO-LGORT", "txtGODYNPRO-LGORT"), SLOC)
keptQuantity = QuantityOf(TextOf(tabs & TRANS_AREA & "/txtGODYNPRO-ERFMG"))
Err.Clear
If Not keptMaterial Then Finish False, "screen-mismatch: material"
If Not keptPlant Then Finish False, "screen-mismatch: plant"
If Not keptSloc Then Finish False, "screen-mismatch: location"
If keptQuantity <> count Then Finish False, "screen-mismatch: quantity"

' 3. Serial Numbers tab: one serial per row, scrolling past the visible rows. No Enter.
FindCarrier
s.findById(tabs & "/tabpOK_GOITEM_SERIAL").Select
WaitIdle
If Err.Number <> 0 Then Err.Clear : Finish False, "migo-screen-changed: SERIAL"
FindCarrier
Dim table, visible, top, row
Set table = s.findById(tabs & SERIAL_TABLE)
If Err.Number <> 0 Then Err.Clear : Finish False, "migo-screen-changed: serial table"
visible = 0
visible = table.VisibleRowCount
If Err.Number <> 0 Or visible < 1 Then Err.Clear : Finish False, "migo-screen-changed: serial table"
top = 0
For i = 0 To count - 1
  If i - top >= visible Then
    table.VerticalScrollbar.Position = i
    WaitIdle
    Set table = s.findById(tabs & SERIAL_TABLE)
    top = -1
    top = table.VerticalScrollbar.Position
    visible = table.VisibleRowCount
    If Err.Number <> 0 Then Err.Clear : Finish False, "serial-table-scroll-failed"
    If i - top < 0 Or i - top >= visible Then Finish False, "serial-table-scroll-failed"
  End If
  row = i - top
  s.findById(tabs & SERIAL_TABLE & "/txtGOSERIAL-SERIALNO[0," & row & "]").Text = serials(i)
  If Err.Number <> 0 Then Err.Clear : Finish False, "serial-table-changed"
  If UCase(TextOf(tabs & SERIAL_TABLE & "/txtGOSERIAL-SERIALNO[0," & row & "]")) <> serials(i) Then Finish False, "serial-not-set"
Next

' 4. Check: only "Document is O.K." goes on.
s.findById("wnd[0]/tbar[1]/btn[7]").press
WaitIdle
If Err.Number <> 0 Then Err.Clear : Finish False, "migo-check-failed"
ContinueSerialInfo
StopOnPopup "check"
Dim status
status = TextOf("wnd[0]/sbar")
If InStr(1, status, "Document is O.K.", vbTextCompare) = 0 Then
  If status = "" Then status = "Check in MIGO gave no answer"
  Finish False, "sap: " & status
End If

' 5. Post.
s.findById("wnd[0]/tbar[1]/btn[23]").press
WaitIdle
If Err.Number <> 0 Then Err.Clear : Finish False, "unknown-result: post-button"
ContinueSerialInfo
status = TextOf("wnd[0]/sbar")
re.Pattern = "Material document (\d+) posted"
Set matches = re.Execute(status)
If Err.Number <> 0 Then Err.Clear : Finish False, "unknown-result: " & status
If matches.Count > 0 Then
  doc = matches(0).SubMatches(0)
  Finish True, ""
End If
Dim messageType
messageType = ""
messageType = s.findById("wnd[0]/sbar").MessageType
Err.Clear
If PopupCount() = 0 And (messageType = "E" Or messageType = "A") Then Finish False, "sap: " & status
Finish False, "unknown-result: " & ScreenOf() & " " & status
