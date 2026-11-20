' CountPoint - Softwareload: Transfer serial numbers to another storage location in ZMS_REP (TCD) or ZMS_PREP (TRR).
' CHANGES SAP: one transfer movement (material document) for all serials, or nothing (SAP moves all or nothing).
' Usage: sl-transfer.vbs <system> <rep|prep> <to> <outDir> <inFile> <errFile> <from>
' The serials are in <inFile> (one per line) and CountPoint has put the same list on the clipboard; VBScript cannot.
' Opens its OWN session on <system> (refuses any other), searches exactly like sl-lookup.vbs and only presses Transfer
' when the result list holds exactly the serials of <inFile>, every one on <from> (the cockpit moves rows from where
' they stand). Then Select All, Transfer, target location, Enter.
' Output: {"ok":true,"doc":"<material document>"}, or {"ok":false,"error":"rows-mismatch"} (nothing pressed),
' {"ok":false,"error":"from-mismatch"} (a row is not on <from>; nothing pressed),
' {"ok":false,"error":"sap-errors"} (SAP's log: TYPE=E rows to <errFile> as MESSAGE, MESSAGE_V3, MESSAGE_V4),
' {"ok":false,"error":"language-not-supported"} (the session is not in English; nothing pressed) or
' {"ok":false,"error":"..."}.
Option Explicit
On Error Resume Next

Const PLANT = "D301"
Const MAX_SERIALS = 500
Const GRID_ID = "wnd[0]/usr/cntlGRID1/shellcont/shell/shellcont[1]/shell"
Const TARGET_FIELD = "wnd[1]/usr/sub:SAPLSPO4:0300/ctxtSVALD-VALUE[0,21]"
Dim systemName, mode, target, source, outDir, inFile, errFile, tcode, app, conn, base, s, i, before, beforeIds, fso, ownId, doc
Dim wanted, asked, firstSerial, text, lines, key, re

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

' The connection to <system> only; never another system.
Function SystemConnection(engine, wantedSystem)
  On Error Resume Next
  Dim n, candidate
  Set SystemConnection = Nothing
  For n = 0 To engine.Children.Count - 1
    Set candidate = engine.Children(CInt(n))
    If candidate.Children.Count > 0 Then
      If candidate.Children(0).Info.SystemName = wantedSystem Then Set SystemConnection = candidate : Exit Function
    End If
  Next
  Err.Clear
End Function

' Serial as compared: upper case, no blanks, no leading zeros (SAP may show numeric serials without them).
Function SerialKey(value)
  On Error Resume Next
  Dim t
  SerialKey = ""
  t = UCase(Trim(CStr(value)))
  Do While Len(t) > 1 And Left(t, 1) = "0"
    t = Mid(t, 2)
  Loop
  SerialKey = t
End Function

' Number of distinct rows in an ALV SelectedRows text ("0-4", "0,1,2" or "0,2-4"); -1 when a row is outside 0..total-1
' or the text cannot be read.
Function SelectedCount(selection, total)
  On Error Resume Next
  Dim parts, part, bounds, first, last, n, seen, result
  SelectedCount = -1
  If total < 1 Then Exit Function
  ReDim seen(total - 1)
  result = 0
  parts = Replace(CStr(selection), " ", "")
  If Len(parts) = 0 Then Exit Function
  parts = Split(parts, ",")
  For Each part In parts
    If Len(part) = 0 Then Exit Function
    bounds = Split(part, "-")
    If UBound(bounds) > 1 Then Exit Function
    If Not IsNumeric(bounds(0)) Or Not IsNumeric(bounds(UBound(bounds))) Then Exit Function
    first = CLng(bounds(0))
    last = CLng(bounds(UBound(bounds)))
    If Err.Number <> 0 Then Err.Clear : Exit Function
    If first < 0 Or last < first Or last > total - 1 Then Exit Function
    For n = first To last
      If Not seen(n) Then seen(n) = True : result = result + 1
    Next
  Next
  If Err.Number <> 0 Then Err.Clear : Exit Function
  SelectedCount = result
End Function

' Reads a text property; "" when it does not exist (an error inside an If condition would run the Then branch).
Function TextOf(path)
  On Error Resume Next
  TextOf = ""
  TextOf = CStr(s.findById(path).Text)
  Err.Clear
End Function

Function HasColumn(grid, column)
  On Error Resume Next
  Dim c
  HasColumn = False
  For c = 0 To grid.ColumnCount - 1
    If grid.ColumnOrder(CInt(c)) = column Then HasColumn = True : Exit Function
  Next
  Err.Clear
End Function

' SAP's message log after a refused Transfer: a grid with TYPE and MESSAGE columns, wherever it is shown.
Function FindLogGrid(parent)
  On Error Resume Next
  Dim k, child, kind, subKind, isContainer, found
  Set FindLogGrid = Nothing
  For k = 0 To parent.Children.Count - 1
    Set child = parent.Children(CInt(k))
    kind = ""
    subKind = ""
    kind = child.Type
    subKind = child.SubType
    Err.Clear
    If kind = "GuiShell" And subKind = "GridView" Then
      If HasColumn(child, "TYPE") And HasColumn(child, "MESSAGE") Then Set FindLogGrid = child : Exit Function
    End If
    isContainer = False
    isContainer = child.ContainerType
    If Err.Number <> 0 Then Err.Clear : isContainer = False
    If isContainer Then
      Set found = FindLogGrid(child)
      If Not found Is Nothing Then Set FindLogGrid = found : Exit Function
    End If
  Next
  Err.Clear
End Function

Function UploadSerials()
  On Error Resume Next
  Dim attempt
  UploadSerials = False
  For attempt = 1 To 3
    s.findById("wnd[0]/usr/btn%_S_SERNR_%_APP_%-VALU_PUSH").press
    WaitIdle
    s.findById("wnd[1]/tbar[0]/btn[24]").press
    WaitIdle
    s.findById("wnd[1]/tbar[0]/btn[8]").press
    WaitIdle
    If Err.Number <> 0 Then Err.Clear : Finish False, "multiple-selection-failed"
    ' The clipboard is sometimes not ready on the first try.
    If SerialKey(TextOf("wnd[0]/usr/txtS_SERNR-LOW")) = SerialKey(firstSerial) Then UploadSerials = True : Exit Function
    WScript.Sleep 500
  Next
End Function

' The Transfer's outcome: SAP's Information box with the document, or its message log, or the status bar.
Sub ReadResult()
  On Error Resume Next
  Dim message, matches, logGrid, r, stream, errors, messageType, where, popups, screenId
  message = ""
  If s.Children.Count > 1 Then message = Trim(TextOf("wnd[1]/usr/txtMESSTXT1") & " " & TextOf("wnd[1]/usr/txtMESSTXT2") & " " & TextOf("wnd[1]/usr/txtMESSTXT3"))
  Err.Clear
  re.Pattern = "Transfer Movement (\d+) successfully created"
  Set matches = re.Execute(message)
  If matches.Count > 0 Then
    doc = matches(0).SubMatches(0)
    s.findById("wnd[1]").sendVKey 0
    WaitIdle
    Err.Clear
    Finish True, ""
  End If

  Set logGrid = Nothing
  If s.Children.Count > 1 Then Set logGrid = FindLogGrid(s.findById("wnd[" & (s.Children.Count - 1) & "]"))
  If logGrid Is Nothing Then Set logGrid = FindLogGrid(s.findById("wnd[0]"))
  Err.Clear
  If Not logGrid Is Nothing Then
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 2
    stream.Charset = "utf-8"
    stream.Open
    errors = 0
    For r = 0 To logGrid.RowCount - 1
      If r Mod 30 = 0 Then logGrid.FirstVisibleRow = r : WaitIdle
      messageType = ""
      messageType = UCase(Trim(CStr(logGrid.GetCellValue(CLng(r), "TYPE"))))
      If Err.Number <> 0 Then Err.Clear : stream.Close : Finish False, "unknown-result: log-not-readable"
      If messageType = "E" Or messageType = "A" Then
        message = CStr(logGrid.GetCellValue(CLng(r), "MESSAGE"))
        If Err.Number <> 0 Then Err.Clear : stream.Close : Finish False, "unknown-result: log-not-readable"
        where = ""
        If HasColumn(logGrid, "MESSAGE_V3") Then where = CStr(logGrid.GetCellValue(CLng(r), "MESSAGE_V3"))
        where = where & vbTab
        If HasColumn(logGrid, "MESSAGE_V4") Then where = where & CStr(logGrid.GetCellValue(CLng(r), "MESSAGE_V4"))
        Err.Clear
        stream.WriteText Replace(Replace(Replace(message, vbTab, " "), vbCr, " "), vbLf, " ") & vbTab & Replace(Replace(where, vbCr, " "), vbLf, " ") & vbCrLf
        errors = errors + 1
      End If
    Next
    stream.SaveToFile outDir & "\" & errFile, 2
    stream.Close
    If Err.Number <> 0 Then Err.Clear : Finish False, "unknown-result: log-not-saved"
    If errors = 0 Then Finish False, "unknown-result: log-without-errors"
    Finish False, "sap-errors"
  End If

  popups = -1
  popups = s.Children.Count
  messageType = ""
  messageType = s.findById("wnd[0]/sbar").MessageType
  message = TextOf("wnd[0]/sbar")
  screenId = ""
  screenId = s.Info.Program & "/" & s.Info.ScreenNumber
  Err.Clear
  ' Still on the target dialog: SAP refused the location before posting.
  If popups > 1 And UCase(TextOf(TARGET_FIELD)) = target Then
    If message = "" Then message = TextOf("wnd[1]/sbar")
    If message = "" Then message = "target location refused"
    Finish False, "sap: " & message
  End If
  If popups = 1 And (messageType = "E" Or messageType = "A") Then Finish False, "sap: " & message
  Finish False, "unknown-result: " & screenId & " " & message
End Sub

Set s = Nothing
doc = ""
If WScript.Arguments.Count < 7 Then Err.Clear : Finish False, "arguments"
systemName = WScript.Arguments(0)
mode = LCase(WScript.Arguments(1))
target = UCase(Trim(WScript.Arguments(2)))
outDir = WScript.Arguments(3)
inFile = WScript.Arguments(4)
errFile = WScript.Arguments(5)
source = UCase(Trim(WScript.Arguments(6)))
Set fso = CreateObject("Scripting.FileSystemObject")
Set re = New RegExp
re.IgnoreCase = True
If Err.Number <> 0 Then Err.Clear : Finish False, "arguments"
If mode = "rep" Then
  tcode = "ZMS_REP"
ElseIf mode = "prep" Then
  tcode = "ZMS_PREP"
Else
  Finish False, "transaction-not-allowed"
End If
re.Pattern = "^[A-Z][0-9]{3}$"
If Not re.Test(target) Then Finish False, "target-invalid"
If Not re.Test(source) Then Finish False, "from-invalid"
If Not fso.FolderExists(outDir) Then Finish False, "out-dir-missing"
If fso.FileExists(outDir & "\" & errFile) Then fso.DeleteFile outDir & "\" & errFile
text = fso.OpenTextFile(outDir & "\" & inFile, 1).ReadAll
If Err.Number <> 0 Then Err.Clear : Finish False, "in-file-missing"
lines = Split(Replace(text, vbCr, ""), vbLf)
Set wanted = CreateObject("Scripting.Dictionary")
firstSerial = ""
For i = 0 To UBound(lines)
  key = SerialKey(lines(i))
  If Len(key) > 0 Then
    If firstSerial = "" Then firstSerial = Trim(lines(i))
    If Not wanted.Exists(key) Then wanted.Add key, 0
  End If
Next
asked = wanted.Count
If asked = 0 Then Finish False, "no-serials"
If asked > MAX_SERIALS Then Finish False, "too-many-serials"
Err.Clear

Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-not-running"
Set conn = SystemConnection(app, systemName)
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
If s.Info.SystemName <> systemName Then Err.Clear : Finish False, "wrong-system"
' SAP's answers below ("successfully created", the log) are read in English; another logon language could hide a
' posted document, so nothing is pressed unless the session is in English.
Dim logonLanguage
logonLanguage = ""
logonLanguage = UCase(Trim(CStr(s.Info.Language)))
Err.Clear
If logonLanguage <> "EN" And logonLanguage <> "E" Then Finish False, "language-not-supported"
s.findById("wnd[0]").Iconify
Err.Clear

' The same search as sl-lookup.vbs.
s.findById("wnd[0]/tbar[0]/okcd").Text = "/n" & tcode
s.findById("wnd[0]").sendVKey 0
WaitIdle
If Err.Number <> 0 Or s.Info.Transaction <> tcode Then Err.Clear : Finish False, "no-access-" & LCase(tcode)
s.findById("wnd[0]/usr/radP_SERIAL").Select
WaitIdle
s.findById("wnd[0]/usr/ctxtS_PLANT-LOW").Text = PLANT
s.findById("wnd[0]/usr/ctxtS_MATNR-LOW").Text = ""
s.findById("wnd[0]/usr/txtS_SERNR-LOW").Text = ""
If Err.Number <> 0 Then Err.Clear : Finish False, "screen-changed"
If Not UploadSerials() Then Finish False, "serial-filter-missing"
If UCase(TextOf("wnd[0]/usr/ctxtS_PLANT-LOW")) <> PLANT Then Finish False, "plant-filter-missing"
s.findById("wnd[0]").sendVKey 8
WaitIdle
If Err.Number <> 0 Then Err.Clear : Finish False, "screen-changed"
Dim screen
screen = ""
screen = CStr(s.Info.ScreenNumber)
If Err.Number <> 0 Then Err.Clear : Finish False, "read-failed"
If screen = "1000" Then
  If s.findById("wnd[0]/sbar").MessageType = "E" Then Finish False, "sap: " & TextOf("wnd[0]/sbar")
  Finish False, "rows-mismatch"
End If

' Only press Transfer when the list is exactly the serials asked for: every row asked for, every serial once.
Dim grid, total, r, found, hasLgort, hasWerksLgort, slocColumn, rowSloc, wrongPlace
Set grid = s.findById(GRID_ID)
If Err.Number <> 0 Then Err.Clear : Finish False, "result-list-changed"
If Not HasColumn(grid, "SERNR") Then Finish False, "result-list-changed"
' ZMS_PREP shows LGORT ("D000"), ZMS_REP shows WERKS_LGORT ("D301-D000").
hasLgort = HasColumn(grid, "LGORT")
hasWerksLgort = HasColumn(grid, "WERKS_LGORT")
slocColumn = ""
If hasLgort Then
  slocColumn = "LGORT"
ElseIf hasWerksLgort Then
  slocColumn = "WERKS_LGORT"
End If
If slocColumn = "" Then Finish False, "result-list-changed"
total = -1
total = grid.RowCount
If Err.Number <> 0 Then Err.Clear : Finish False, "read-failed"
If total <> asked Then Finish False, "rows-mismatch"
found = 0
wrongPlace = False
For r = 0 To total - 1
  If r Mod 30 = 0 Then grid.FirstVisibleRow = r : WaitIdle
  key = ""
  key = SerialKey(grid.GetCellValue(CLng(r), "SERNR"))
  If Err.Number <> 0 Then Err.Clear : Finish False, "read-failed"
  If Not wanted.Exists(key) Then Finish False, "rows-mismatch"
  If wanted(key) <> 0 Then Finish False, "rows-mismatch"
  wanted(key) = 1
  found = found + 1
  rowSloc = ""
  rowSloc = UCase(Trim(CStr(grid.GetCellValue(CLng(r), slocColumn))))
  If Err.Number <> 0 Then Err.Clear : Finish False, "read-failed"
  If InStr(rowSloc, "-") > 0 Then rowSloc = Trim(Mid(rowSloc, InStrRev(rowSloc, "-") + 1))
  If rowSloc <> source Then wrongPlace = True
Next
If found <> asked Then Finish False, "rows-mismatch"
If wrongPlace Then Finish False, "from-mismatch"
Err.Clear

s.findById("wnd[0]/tbar[1]/btn[5]").press
WaitIdle
If Err.Number <> 0 Then Err.Clear : Finish False, "select-all-failed"
' All or nothing: Transfer moves the selected rows, so every row of the checked list must be selected.
Dim selected, chosenRows, rowsNow
selected = ""
selected = CStr(s.findById(GRID_ID).SelectedRows)
If Err.Number <> 0 Then Err.Clear : selected = ""
If Len(selected) = 0 Then Finish False, "select-all-failed"
rowsNow = -1
rowsNow = s.findById(GRID_ID).RowCount
If Err.Number <> 0 Then Err.Clear : rowsNow = -1
chosenRows = SelectedCount(selected, total)
If rowsNow <> total Or chosenRows <> total Then Finish False, "selection-mismatch"
s.findById("wnd[0]/tbar[1]/btn[36]").press
WaitIdle
If Err.Number <> 0 Then Err.Clear : Finish False, "transfer-button-failed"
s.findById(TARGET_FIELD).Text = target
If Err.Number <> 0 Then Err.Clear : Finish False, "transfer-dialog-changed"
If UCase(TextOf(TARGET_FIELD)) <> target Then Finish False, "transfer-dialog-changed"
s.findById("wnd[1]").sendVKey 0
WaitIdle
Err.Clear
ReadResult
Finish False, "unknown-result"
