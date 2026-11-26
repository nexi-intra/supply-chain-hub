' Finland T&T - ZMS_cons_info export (read only).
' Usage: zms-cons-info.vbs <outFile> <system> <salesOrg> <from DD.MM.YYYY> <to DD.MM.YYYY>
' Opens its OWN session (never types into the user's session), runs ZMS_CONS_INFO for
' outbound deliveries, writes the ALV grid as UTF-16 tab-separated text with the technical
' column names in the first line, and closes its session again.
' Output: one JSON line {"ok":true,"rows":N} or {"ok":false,"error":"...","sap":"..."}.
Option Explicit
On Error Resume Next

Const PRE = "wnd[0]/usr/tabsTABSTRIP_TABSTRIP/tabpSEARCH/ssub%_SUBSCREEN_TABSTRIP:ZMS_CONSIGNOR_DELIVERY_TIME:1001/"
Dim outFile, wantedSystem, wantedClient, salesOrg, dateFrom, dateTo
Dim app, conn, s, base, i, before, beforeIds, fso, rows, grid, msgType, msgText

Function JsonText(value)
  Dim t
  t = CStr(value)
  t = Replace(t, "\", "\\")
  t = Replace(t, """", "\""")
  t = Replace(t, vbCr, " ")
  t = Replace(t, vbLf, " ")
  t = Replace(t, vbTab, " ")
  JsonText = """" & t & """"
End Function

Sub Finish(ok, code, sapText)
  On Error Resume Next
  CloseOwnSession
  If ok Then
    WScript.StdOut.WriteLine "{""ok"":true,""rows"":" & rows & "}"
  Else
    If fso.FileExists(outFile) Then fso.DeleteFile outFile
    WScript.StdOut.WriteLine "{""ok"":false,""error"":" & JsonText(code) & ",""sap"":" & JsonText(sapText) & "}"
  End If
  WScript.Quit 0
End Sub

Sub WaitIdle()
  On Error Resume Next
  Dim n
  For n = 1 To 5400
    If s Is Nothing Then Exit Sub
    If Not s.Busy Then Exit Sub
    WScript.Sleep 100
  Next
End Sub

Sub CloseOwnSession()
  On Error Resume Next
  Dim n, stillOpen, k, ownId, tries
  If s Is Nothing Then Exit Sub
  Err.Clear
  ownId = s.Id
  tries = 0
  Do While s.Children.Count > 1 And tries < 5
    tries = tries + 1
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

Sub ReadStatusBar()
  On Error Resume Next
  Err.Clear
  msgType = ""
  msgText = ""
  msgType = CStr(s.findById("wnd[0]/sbar").MessageType)
  msgText = CStr(s.findById("wnd[0]/sbar").Text)
  Err.Clear
End Sub

Function FindGrid(o)
  On Error Resume Next
  Dim k, ch, f
  Set FindGrid = Nothing
  For k = 0 To o.Children.Count - 1
    Set ch = o.Children(CInt(k))
    If ch.Type = "GuiShell" Then
      If ch.SubType = "GridView" Then Set FindGrid = ch : Exit Function
    End If
    If ch.ContainerType Then
      Set f = FindGrid(ch)
      If Not f Is Nothing Then Set FindGrid = f : Exit Function
    End If
  Next
End Function

Function SystemConnection(engine)
  On Error Resume Next
  Dim n, target
  Set SystemConnection = Nothing
  For n = 0 To engine.Children.Count - 1
    Set target = engine.Children(CInt(n))
    If target.Children.Count > 0 Then
      If target.Children(0).Info.SystemName = wantedSystem And (wantedClient = "" Or CStr(target.Children(0).Info.Client) = wantedClient) Then Set SystemConnection = target : Exit Function
    End If
  Next
  Err.Clear
End Function

Sub WriteGrid()
  Dim cols, c, r, line, out
  Set cols = grid.ColumnOrder
  Set out = fso.CreateTextFile(outFile, True, True)
  line = ""
  For c = 0 To cols.Count - 1 : line = line & cols(c) & vbTab : Next
  out.WriteLine line
  For r = 0 To grid.RowCount - 1
    ' The grid only loads the rows that have been scrolled into view.
    If r Mod 20 = 0 Then grid.FirstVisibleRow = r
    line = ""
    For c = 0 To cols.Count - 1 : line = line & Replace(CStr(grid.GetCellValue(r, cols(c))), vbTab, " ") & vbTab : Next
    out.WriteLine line
  Next
  out.Close
End Sub

Set s = Nothing
Set fso = CreateObject("Scripting.FileSystemObject")
If WScript.Arguments.Count < 5 Then WScript.StdOut.WriteLine "{""ok"":false,""error"":""bad-arguments"",""sap"":""""}" : WScript.Quit 0
outFile = WScript.Arguments(0)
wantedSystem = WScript.Arguments(1)
' In the Hub the system and client it is set to (COUNTPOINT_SAP_SYSTEM, COUNTPOINT_SAP_CLIENT) win over the argument.
If CreateObject("WScript.Shell").Environment("PROCESS")("COUNTPOINT_SAP_SYSTEM") <> "" Then wantedSystem = CreateObject("WScript.Shell").Environment("PROCESS")("COUNTPOINT_SAP_SYSTEM")
wantedClient = CreateObject("WScript.Shell").Environment("PROCESS")("COUNTPOINT_SAP_CLIENT")
salesOrg = WScript.Arguments(2)
dateFrom = WScript.Arguments(3)
dateTo = WScript.Arguments(4)
rows = 0
If fso.FileExists(outFile) Then fso.DeleteFile outFile

Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-not-running", ""
Set conn = SystemConnection(app)
If conn Is Nothing Then Err.Clear : Finish False, "not-logged-in", ""
If UCase(conn.Children(0).Info.Language) <> "EN" Then Finish False, "wrong-language", ""

Set base = Nothing
For i = 0 To conn.Children.Count - 1
  If Not conn.Children(CInt(i)).Busy Then Set base = conn.Children(CInt(i)) : Exit For
Next
If base Is Nothing Then Finish False, "sap-busy", ""
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
If s Is Nothing Then Err.Clear : Finish False, "session-not-created", ""
WaitIdle
s.findById("wnd[0]").Iconify
Err.Clear

s.findById("wnd[0]/tbar[0]/okcd").Text = "/nZMS_CONS_INFO"
s.findById("wnd[0]").sendVKey 0
WaitIdle
If s.Info.Transaction <> "ZMS_CONS_INFO" Then
  ReadStatusBar
  Finish False, "sap-error", msgText
End If
Err.Clear
s.findById(PRE & "radP_DELIV").Select
s.findById(PRE & "txtS_DELIV-LOW").Text = ""
s.findById(PRE & "ctxtS_TRACK-LOW").Text = ""
s.findById(PRE & "ctxtS_VKORG-LOW").Text = salesOrg
s.findById(PRE & "txtS_VSTEL-LOW").Text = ""
s.findById(PRE & "ctxtS_VSART-LOW").Text = ""
s.findById(PRE & "ctxtS_VSART-HIGH").Text = ""
s.findById(PRE & "ctxtS_ERDAT-LOW").Text = dateFrom
s.findById(PRE & "ctxtS_ERDAT-HIGH").Text = dateTo
s.findById(PRE & "ctxtS_STATUS-LOW").Text = ""
s.findById(PRE & "chkP_OVRDUE").Selected = False
If Err.Number <> 0 Then Err.Clear : Finish False, "screen-changed", ""

s.findById("wnd[0]").sendVKey 8
WaitIdle
If s.Children.Count > 1 Then
  ' A popup instead of a list, e.g. "No data found".
  msgText = ""
  msgText = s.findById("wnd[1]").Text & ": " & s.findById("wnd[1]/usr").Children(0).Text
  Err.Clear
  Finish False, "no-rows", msgText
End If
Set grid = FindGrid(s.findById("wnd[0]/usr"))
If grid Is Nothing Then
  ReadStatusBar
  If msgType = "E" Or msgType = "A" Then Finish False, "sap-error", msgText
  If msgText <> "" Then Finish False, "no-rows", msgText
  Finish False, "screen-changed", ""
End If
Err.Clear
If grid.RowCount = 0 Then Finish False, "no-rows", ""
WriteGrid
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-error", "Listen kunne ikke gemmes"
rows = grid.RowCount
Finish True, "", ""
