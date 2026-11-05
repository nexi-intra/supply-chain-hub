' CountPoint - put the counted serial numbers on a PI document in ZMS_COUNT_SERIAL (CHANGES SAP once the user presses
' "Update Count"). Usage: pidoc-serials.vbs <system> <docNo> <year> <material> <outDir> <inFile> <outFile> <waitSeconds>
'   inFile = the serial numbers, one per line (long or short; ZMS_COUNT_SERIAL accepts both).
' Opens its OWN session on <system> (refuses any other), selects the item, fills the serials ("Add lines" per 1000),
' presses Check (validation only) and stops with the errors if there are any. Without errors it WAITS for the user to
' press "Update Count" (or "Update Count + Create new"); then leaves the document so it is not locked for posting.
' outFile: one line per serial with an error: serial<TAB>message. Output: {"ok":true,"message":"..","newSerials":N}
' or {"ok":false,"error":"..","errors":N}.
Option Explicit
On Error Resume Next

Dim systemName, docNo, year, material, outDir, inFile, outFile, waitSeconds, app, conn, base, s, i, before, beforeIds, ownId
Dim fso, serials, count, grid, list, row, errorsFound, newSerials, stream, message, text

Function JsonText(value)
  Dim t
  t = CStr(value)
  t = Replace(t, "\", "\\")
  t = Replace(t, """", "\""")
  t = Replace(t, vbCr, " ")
  t = Replace(t, vbLf, " ")
  JsonText = """" & t & """"
End Function

Sub Finish(ok, text, extra)
  CloseOwnSession
  If ok Then
    WScript.StdOut.WriteLine "{""ok"":true,""message"":" & JsonText(text) & extra & "}"
  Else
    WScript.StdOut.WriteLine "{""ok"":false,""error"":" & JsonText(text) & extra & "}"
  End If
  WScript.Quit 0
End Sub

Sub WaitIdle()
  Dim n
  For n = 1 To 6000
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
  ' Closing the session leaves the document (unsaved entries are discarded), so it is not locked for posting.
  s.findById("wnd[0]/tbar[0]/okcd").Text = "/i"
  s.findById("wnd[0]").sendVKey 0
  For n = 1 To 50
    WScript.Sleep 100
    If Not SessionOpen() Then Exit For
  Next
  Set s = Nothing
End Sub

Function SerialGrid()
  Set SerialGrid = s.findById("wnd[0]/usr/cntlGRID1/shellcont/shell/shellcont[1]/shell")
End Function

systemName = WScript.Arguments(0)
docNo = WScript.Arguments(1)
year = WScript.Arguments(2)
material = UCase(Trim(WScript.Arguments(3)))
outDir = WScript.Arguments(4)
inFile = WScript.Arguments(5)
outFile = WScript.Arguments(6)
waitSeconds = CLng(WScript.Arguments(7))
Set s = Nothing
Set fso = CreateObject("Scripting.FileSystemObject")
If Err.Number <> 0 Then Err.Clear : Finish False, "arguments", ""
If Len(docNo) < 9 Or Len(docNo) > 10 Or Len(year) <> 4 Or Len(material) = 0 Then Finish False, "arguments", ""
If fso.FileExists(outDir & "\" & outFile) Then fso.DeleteFile outDir & "\" & outFile
text = fso.OpenTextFile(outDir & "\" & inFile, 1).ReadAll
If Err.Number <> 0 Then Err.Clear : Finish False, "in-file-missing", ""
serials = Split(Replace(text, vbCr, ""), vbLf)
count = 0
For i = 0 To UBound(serials)
  serials(i) = UCase(Trim(serials(i)))
  If Len(serials(i)) > 0 Then count = count + 1
Next
If count = 0 Then Finish False, "no-serials", ""

Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-not-running", ""
Set conn = Nothing
For i = 0 To app.Children.Count - 1
  If app.Children(CInt(i)).Children.Count > 0 Then
    If app.Children(CInt(i)).Children(0).Info.SystemName = systemName Then Set conn = app.Children(CInt(i))
  End If
Next
Err.Clear
If conn Is Nothing Then Finish False, "not-logged-in-" & systemName, ""
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
ownId = s.Id
WaitIdle
If s.Info.SystemName <> systemName Then Finish False, "wrong-system", ""
Err.Clear

s.findById("wnd[0]/tbar[0]/okcd").Text = "/nZMS_COUNT_SERIAL"
s.findById("wnd[0]").sendVKey 0
WaitIdle
If Err.Number <> 0 Or s.Info.Transaction <> "ZMS_COUNT_SERIAL" Then Err.Clear : Finish False, "no-access-zms_count_serial", ""
s.findById("wnd[0]/usr/ctxtP_IBLNR").Text = docNo
s.findById("wnd[0]/usr/txtP_GJAHR").Text = year
s.findById("wnd[0]").sendVKey 8
WaitIdle
Set list = s.findById("wnd[0]/usr/cntlGRID1/shellcont/shell")
If Err.Number <> 0 Then Err.Clear : Finish False, "sap: " & s.findById("wnd[0]/sbar").Text, ""
row = -1
For i = 0 To list.RowCount - 1
  If UCase(list.GetCellValue(i, "MATNR")) = material Then row = i
Next
If row < 0 Then Finish False, "item-not-found", ""
list.selectedRows = CStr(row)
s.findById("wnd[0]/tbar[1]/btn[22]").press
WaitIdle
Set grid = SerialGrid()
If Err.Number <> 0 Then Err.Clear : Finish False, "serial-screen-changed", ""
If Len(grid.GetCellValue(0, "SERIAL24")) > 0 Or Len(grid.GetCellValue(0, "SERNR")) > 0 Then Finish False, "serials-already-entered", ""

' Fill: "Add lines" gives 1000 more rows each time.
Do While grid.RowCount < count
  s.findById("wnd[0]/tbar[1]/btn[37]").press
  WaitIdle
  Set grid = SerialGrid()
  If Err.Number <> 0 Then Err.Clear : Finish False, "add-lines-failed", ""
Loop
row = 0
For i = 0 To UBound(serials)
  If Len(serials(i)) > 0 Then
    If row Mod 50 = 0 Then grid.FirstVisibleRow = row
    grid.ModifyCell row, "SERIAL24", serials(i)
    row = row + 1
  End If
Next
grid.TriggerModified
WaitIdle
If Err.Number <> 0 Then Err.Clear : Finish False, "fill-failed", ""

s.findById("wnd[0]/tbar[1]/btn[44]").press
WaitIdle
Set grid = SerialGrid()
If Err.Number <> 0 Then Err.Clear : Finish False, "check-failed", ""
errorsFound = 0
newSerials = 0
Set stream = CreateObject("ADODB.Stream")
stream.Type = 2
stream.Charset = "utf-8"
stream.Open
For i = 0 To count - 1
  If i Mod 50 = 0 Then grid.FirstVisibleRow = i
  If grid.GetCellValue(i, "ERROR") <> "" Or Len(grid.GetCellValue(i, "ERROR_MSG")) > 0 Then
    errorsFound = errorsFound + 1
    stream.WriteText grid.GetCellValue(i, "SERIAL24") & vbTab & grid.GetCellValue(i, "ERROR_MSG") & vbCrLf
  End If
  If Len(grid.GetCellValue(i, "SERNR_NEW")) > 0 Then newSerials = newSerials + 1
Next
stream.SaveToFile outDir & "\" & outFile, 2
stream.Close
If Err.Number <> 0 Then Err.Clear : Finish False, "read-failed", ""
If errorsFound > 0 Then Finish False, "check-errors", ",""errors"":" & errorsFound
grid.FirstVisibleRow = 0

' Hand over to the user: "Update Count" (or "Update Count + Create new" when SAP proposes new serial numbers).
s.findById("wnd[0]").Restore
s.findById("wnd[0]").SetFocus
Err.Clear
For i = 1 To waitSeconds * 2
  WScript.Sleep 500
  If Not SessionOpen() Then Set s = Nothing : Finish False, "cancelled", ""
  If Not s.Busy Then
    message = s.findById("wnd[0]/sbar").Text
    If Len(message) > 0 Or s.Children.Count > 1 Then Exit For
    Set grid = SerialGrid()
    If Err.Number <> 0 Then Err.Clear : Exit For
  End If
  Err.Clear
Next
If i > waitSeconds * 2 Then Finish False, "timeout", ""
WaitIdle
If s.Children.Count > 1 Then message = s.findById("wnd[1]").Text & ": " & message
If s.findById("wnd[0]/sbar").MessageType = "E" Then Finish False, "sap: " & message, ""

' SAP gives no reliable message after "Update Count": read the item again (display only) and check it is counted.
Err.Clear
Do While s.Children.Count > 1
  s.findById("wnd[" & (s.Children.Count - 1) & "]").sendVKey 12
  WaitIdle
  If Err.Number <> 0 Then Exit Do
Loop
Err.Clear
s.findById("wnd[0]/tbar[0]/okcd").Text = "/nZMS_COUNT_SERIAL"
s.findById("wnd[0]").sendVKey 0
WaitIdle
s.findById("wnd[0]/usr/ctxtP_IBLNR").Text = docNo
s.findById("wnd[0]/usr/txtP_GJAHR").Text = year
s.findById("wnd[0]").sendVKey 8
WaitIdle
Set list = s.findById("wnd[0]/usr/cntlGRID1/shellcont/shell")
If Err.Number <> 0 Then Err.Clear : Finish False, "verify-failed", ""
row = -1
For i = 0 To list.RowCount - 1
  If UCase(list.GetCellValue(i, "MATNR")) = material Then row = i
Next
If row < 0 Then Finish False, "verify-failed", ""
If list.GetCellValue(row, "XZAEL") <> "X" Then Finish False, "not-counted", ""
Finish True, message, ",""newSerials"":" & newSerials & ",""counted"":" & JsonText(list.GetCellValue(row, "MENGE")) & ",""serials"":" & JsonText(list.GetCellValue(row, "SERNR_COUNT"))
