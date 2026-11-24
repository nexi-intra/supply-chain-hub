' CountPoint - long serial numbers (SERGE) via SQ01 query ZMS_LONG_SERNO (user group ZMS). Read only.
' Usage: longserno.vbs <outDir> <outFile> <inFile> <material>
' CountPoint puts the short serials (one per line, same as inFile) on the clipboard before calling; VBScript cannot.
' Opens its OWN session, fills plant D301 + material, uploads the serials into the serial number multiple selection,
' runs the query and writes UTF-8 tab-separated SERNR, SERGE, MATNR. Never runs without a serial filter (the query
' would list the whole plant) and stops if the result is far larger than the number of serials asked for.
' Output: {"ok":true,"rows":N} or {"ok":false,"error":"..."}.
Option Explicit
On Error Resume Next

Dim outDir, outFile, inFile, material, app, conn, base, s, i, before, beforeIds, fso, rows, grid, ownId
Dim serials, firstSerial, asked, text

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

outDir = WScript.Arguments(0)
outFile = WScript.Arguments(1)
inFile = WScript.Arguments(2)
material = UCase(Trim(WScript.Arguments(3)))
rows = 0
Set s = Nothing
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FolderExists(outDir) Then Finish False, "out-dir-missing"
If fso.FileExists(outDir & "\" & outFile) Then fso.DeleteFile outDir & "\" & outFile
If Len(material) = 0 Or Len(material) > 40 Then Finish False, "material-missing"
text = fso.OpenTextFile(outDir & "\" & inFile, 1).ReadAll
If Err.Number <> 0 Then Err.Clear : Finish False, "in-file-missing"
serials = Split(Replace(text, vbCr, ""), vbLf)
asked = 0
firstSerial = ""
For i = 0 To UBound(serials)
  If Len(Trim(serials(i))) > 0 Then
    asked = asked + 1
    If firstSerial = "" Then firstSerial = Trim(serials(i))
  End If
Next
If asked = 0 Then Finish False, "no-serials"

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

s.findById("wnd[0]/tbar[0]/okcd").Text = "/nSQ01"
s.findById("wnd[0]").sendVKey 0
WaitIdle
If Err.Number <> 0 Or s.Info.Transaction <> "SQ01" Then Err.Clear : Finish False, "no-access-sq01"
s.findById("wnd[0]/usr/ctxtRS38R-QNUM").Text = "ZMS_LONG_SERNO"
s.findById("wnd[0]/tbar[1]/btn[8]").press
WaitIdle
If Err.Number <> 0 Or InStr(s.Info.Program, "ZMS_LONG_SERNO") = 0 Then Err.Clear : Finish False, "no-access-query"

s.findById("wnd[0]/usr/ctxtSP$00001-LOW").Text = material
s.findById("wnd[0]/usr/ctxtSP$00001-HIGH").Text = ""
s.findById("wnd[0]/usr/ctxtSP$00002-LOW").Text = "D301"
s.findById("wnd[0]/usr/ctxtSP$00002-HIGH").Text = ""
s.findById("wnd[0]/usr/ctxtSP$00003-LOW").Text = ""
s.findById("wnd[0]/usr/txtSP$00004-LOW").Text = ""
s.findById("wnd[0]/usr/txtSP$00004-HIGH").Text = ""
s.findById("wnd[0]/usr/txtSP$00005-LOW").Text = ""
If Err.Number <> 0 Then Err.Clear : Finish False, "screen-changed"
s.findById("wnd[0]/usr/btn%_SP$00004_%_APP_%-VALU_PUSH").press
WaitIdle
s.findById("wnd[1]/tbar[0]/btn[16]").press
WaitIdle
s.findById("wnd[1]/tbar[0]/btn[24]").press
WaitIdle
s.findById("wnd[1]/tbar[0]/btn[8]").press
WaitIdle
If Err.Number <> 0 Then Err.Clear : Finish False, "multiple-selection-failed"
' The safety net: without the serial filter the query lists every serial number of the plant.
If UCase(Trim(s.findById("wnd[0]/usr/txtSP$00004-LOW").Text)) <> UCase(firstSerial) Then Finish False, "serial-filter-missing"
If UCase(Trim(s.findById("wnd[0]/usr/ctxtSP$00001-LOW").Text)) <> material Then Finish False, "material-filter-missing"

s.findById("wnd[0]").sendVKey 8
WaitIdle
Err.Clear
If CStr(s.Info.ScreenNumber) = "1000" Then
  If s.findById("wnd[0]/sbar").MessageType = "E" Then Finish False, "sap: " & s.findById("wnd[0]/sbar").Text
  rows = 0
  Finish True, ""
End If

Set grid = s.findById("wnd[0]/usr/cntlCONTAINER/shellcont/shell")
If Err.Number <> 0 Then Err.Clear : Finish False, "result-list-changed"
Dim total, r, stream, line
total = grid.RowCount
If total > asked * 2 + 10 Then Finish False, "too-many-rows"
Set stream = CreateObject("ADODB.Stream")
stream.Type = 2
stream.Charset = "utf-8"
stream.Open
stream.WriteText "SERNR" & vbTab & "SERGE" & vbTab & "MATNR" & vbCrLf
For r = 0 To total - 1
  If r Mod 30 = 0 Then grid.FirstVisibleRow = r : WaitIdle
  line = grid.GetCellValue(CLng(r), "SERNR") & vbTab & grid.GetCellValue(CLng(r), "SERGE") & vbTab & grid.GetCellValue(CLng(r), "MATNR")
  If Err.Number <> 0 Then Err.Clear : stream.Close : Finish False, "read-failed"
  stream.WriteText Replace(Replace(line, vbCr, " "), vbLf, " ") & vbCrLf
Next
stream.SaveToFile outDir & "\" & outFile, 2
stream.Close
If Err.Number <> 0 Then Err.Clear : Finish False, "write-failed"
rows = total
Finish True, ""
