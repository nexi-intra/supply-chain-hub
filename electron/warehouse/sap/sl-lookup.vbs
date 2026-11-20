' CountPoint - Softwareload: where serial numbers stand, via ZMS_REP (TCD) or ZMS_PREP (TRR). Read only.
' Usage: sl-lookup.vbs <rep|prep> <outDir> <outFile>
' CountPoint puts the serials (one per line) on the clipboard before calling; VBScript cannot.
' Opens its OWN session, selects "Serial number", plant D301, uploads the serials into the S_SERNR multiple selection,
' F8, reads the result list and closes the session. The cockpit's other buttons (transfer, status ...) are never pressed.
' Never runs without the serial filter (the cockpit would list the whole plant).
' Writes UTF-8 tab-separated SERNR, MATNR and those of LGORT, WERKS_LGORT, STOCK_TYPE_ICON, STOCK_TYPE, USER_STAT,
' USER_STAT_TXT that the list has. Output: {"ok":true,"rows":N} or {"ok":false,"error":"..."}.
Option Explicit
On Error Resume Next

Const PLANT = "D301"
Const MAX_ROWS = 2000
Dim mode, outDir, outFile, tcode, app, conn, base, s, i, before, beforeIds, fso, rows, grid, ownId

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
    WScript.StdOut.WriteLine "{""ok"":true,""rows"":" & rows & "}"
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

' The connection to the SAP system CountPoint is set to (COUNTPOINT_SAP_SYSTEM); never another system.
Function SystemConnection(engine)
  On Error Resume Next
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

' Multiple selection on the serial number: upload from the clipboard (it is sometimes not ready on the first try).
Function UploadSerials()
  On Error Resume Next
  Dim attempt, current
  UploadSerials = False
  For attempt = 1 To 3
    s.findById("wnd[0]/usr/btn%_S_SERNR_%_APP_%-VALU_PUSH").press
    WaitIdle
    s.findById("wnd[1]/tbar[0]/btn[24]").press
    WaitIdle
    s.findById("wnd[1]/tbar[0]/btn[8]").press
    WaitIdle
    If Err.Number <> 0 Then Err.Clear : Finish False, "multiple-selection-failed"
    ' Read first: an error inside an If condition would run the Then branch.
    current = ""
    current = Trim(s.findById("wnd[0]/usr/txtS_SERNR-LOW").Text)
    If Err.Number <> 0 Then Err.Clear : current = ""
    If Len(current) > 0 Then UploadSerials = True : Exit Function
    WScript.Sleep 500
  Next
End Function

rows = 0
Set s = Nothing
If WScript.Arguments.Count < 3 Then Err.Clear : Finish False, "arguments"
mode = LCase(WScript.Arguments(0))
outDir = WScript.Arguments(1)
outFile = WScript.Arguments(2)
Set fso = CreateObject("Scripting.FileSystemObject")
If mode = "rep" Then
  tcode = "ZMS_REP"
ElseIf mode = "prep" Then
  tcode = "ZMS_PREP"
Else
  Finish False, "transaction-not-allowed"
End If
If Not fso.FolderExists(outDir) Then Finish False, "out-dir-missing"
If fso.FileExists(outDir & "\" & outFile) Then fso.DeleteFile outDir & "\" & outFile
Err.Clear

Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-not-running"
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
If UCase(Trim(s.findById("wnd[0]/usr/ctxtS_PLANT-LOW").Text)) <> PLANT Then Finish False, "plant-filter-missing"
If Err.Number <> 0 Then Err.Clear : Finish False, "screen-changed"
s.findById("wnd[0]").sendVKey 8
WaitIdle
If Err.Number <> 0 Then Err.Clear : Finish False, "screen-changed"
Dim screen
screen = ""
screen = CStr(s.Info.ScreenNumber)
If Err.Number <> 0 Then Err.Clear : Finish False, "read-failed"
If screen = "1000" Then
  If s.findById("wnd[0]/sbar").MessageType = "E" Then Finish False, "sap: " & s.findById("wnd[0]/sbar").Text
  rows = 0
  Finish True, ""
End If

Set grid = s.findById("wnd[0]/usr/cntlGRID1/shellcont/shell/shellcont[1]/shell")
If Err.Number <> 0 Then Err.Clear : Finish False, "result-list-changed"
Dim total, r, stream, columns, c, line, value, wanted, available, name
' ZMS_PREP and ZMS_REP show different layouts; take the known columns that exist.
wanted = Array("SERNR", "MATNR", "LGORT", "WERKS_LGORT", "STOCK_TYPE_ICON", "STOCK_TYPE", "USER_STAT", "USER_STAT_TXT")
available = "|"
For c = 0 To grid.ColumnCount - 1
  available = available & grid.ColumnOrder(CInt(c)) & "|"
Next
columns = ""
For Each name In wanted
  If InStr(available, "|" & name & "|") > 0 Then columns = columns & name & ","
Next
If InStr(columns, "SERNR,") = 0 Or InStr(columns, "MATNR,") = 0 Then Finish False, "result-list-changed"
columns = Split(Left(columns, Len(columns) - 1), ",")
total = grid.RowCount
If Err.Number <> 0 Then Err.Clear : Finish False, "read-failed"
If total > MAX_ROWS Then Finish False, "too-many-rows"
Set stream = CreateObject("ADODB.Stream")
stream.Type = 2
stream.Charset = "utf-8"
stream.Open
stream.WriteText Join(columns, vbTab) & vbCrLf
For r = 0 To total - 1
  If r Mod 30 = 0 Then grid.FirstVisibleRow = r : WaitIdle
  line = ""
  For c = 0 To UBound(columns)
    value = grid.GetCellValue(CLng(r), columns(c))
    If Err.Number <> 0 Then Err.Clear : stream.Close : Finish False, "read-failed"
    value = Replace(Replace(Replace(CStr(value), vbTab, " "), vbCr, " "), vbLf, " ")
    If c > 0 Then line = line & vbTab
    line = line & value
  Next
  stream.WriteText line & vbCrLf
Next
stream.SaveToFile outDir & "\" & outFile, 2
stream.Close
If Err.Number <> 0 Then Err.Clear : Finish False, "write-failed"
rows = total
Finish True, ""
