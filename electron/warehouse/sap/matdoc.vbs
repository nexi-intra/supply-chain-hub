' CountPoint - serial numbers of a material document via ZMS_REP (TCD) or ZMS_PREP (TRR). Read only.
' Usage: matdoc.vbs <rep|prep> <outDir> <outFile> "<document year item>"
' Opens its OWN session, selects "Material document", enters the document, Enter + F8 (exactly like a user),
' reads the result list and closes the session. The cockpit's other buttons (status, transfer, unblock …) are never pressed.
' Writes UTF-8 tab-separated SERNR, MATNR, MAKTX, LGORT, WERKS, USER_STAT. Output: {"ok":true,"rows":N} or {"ok":false,...}.
Option Explicit
On Error Resume Next

Dim mode, outDir, outFile, docText, tcode, app, conn, base, s, i, before, beforeIds, fso, rows, grid, ownId

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
  CloseOwnSession
  If ok Then
    WScript.StdOut.WriteLine "{""ok"":true,""rows"":" & rows & "}"
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

Sub CloseOwnSession()
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

mode = LCase(WScript.Arguments(0))
outDir = WScript.Arguments(1)
outFile = WScript.Arguments(2)
docText = WScript.Arguments(3)
rows = 0
Set s = Nothing
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

Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-not-running"
' The connection to the SAP system CountPoint is set to (COUNTPOINT_SAP_SYSTEM); never another system.
Function SystemConnection(engine)
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
s.findById("wnd[0]/usr/radP_MDOC").Select
WaitIdle
s.findById("wnd[0]/usr/txtP_BRCDE").Text = docText
If Err.Number <> 0 Then Err.Clear : Finish False, "screen-changed"
s.findById("wnd[0]").sendVKey 0
WaitIdle
If s.findById("wnd[0]/sbar").MessageType = "E" Then Finish False, "sap: " & s.findById("wnd[0]/sbar").Text
s.findById("wnd[0]").sendVKey 8
WaitIdle
Err.Clear
If CStr(s.Info.ScreenNumber) = "1000" Then
  If s.findById("wnd[0]/sbar").MessageType = "E" Then Finish False, "sap: " & s.findById("wnd[0]/sbar").Text
  rows = 0
  Finish True, ""
End If

Set grid = s.findById("wnd[0]/usr/cntlGRID1/shellcont/shell/shellcont[1]/shell")
If Err.Number <> 0 Then Err.Clear : Finish False, "result-list-changed"
Dim total, r, stream, columns, c, line, value, wanted, available, name
' ZMS_PREP and ZMS_REP show different layouts; take the known columns that exist.
wanted = Array("SERNR", "MATNR", "MAKTX", "LGORT", "WERKS", "WERKS_LGORT", "STOCK_TYPE", "USER_STAT", "USER_STAT_TXT")
available = "|"
For c = 0 To grid.ColumnCount - 1
  available = available & grid.ColumnOrder(CInt(c)) & "|"
Next
columns = ""
For Each name In wanted
  If InStr(available, "|" & name & "|") > 0 Then columns = columns & name & ","
Next
If InStr(columns, "SERNR,") = 0 Then Finish False, "result-list-changed"
columns = Split(Left(columns, Len(columns) - 1), ",")
total = grid.RowCount
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
