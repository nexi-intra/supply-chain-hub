' CountPoint - enter counted quantities on a PI document in MI04 (CHANGES SAP once the user presses Save).
' Usage: pidoc-count.vbs <system> <docNo> <year> <outDir> <inFile> <waitSeconds>
'   inFile = material<TAB>quantity per line (whole numbers); 0 sets "Zero Count".
' Opens its OWN session on <system> (refuses any other), fills every item of the document (all pages), and WAITS for the
' user to press Save. Then reads the items again in ZMS_COUNT_SERIAL (display only) and checks they are counted; also
' when the wait times out, as the user may have saved and left the screen.
' Output: {"ok":true,"message":"..","items":N} or {"ok":false,"error":".."}, with "timedOut":true after a timeout.
Option Explicit
On Error Resume Next

Const SUB_AREA = "wnd[0]/usr/sub:SAPMM07I:0731/"
Dim systemName, docNo, year, outDir, inFile, waitSeconds, app, conn, base, s, i, before, beforeIds, ownId, client
Dim fso, text, lines, parts, wanted, filled, r, field, material, qty, page, message, list, row, wrong, timedOut

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
  Dim tail
  CloseOwnSession
  tail = extra
  If timedOut Then tail = tail & ",""timedOut"":true"
  If ok Then
    WScript.StdOut.WriteLine "{""ok"":true,""message"":" & JsonText(text) & tail & "}"
  Else
    WScript.StdOut.WriteLine "{""ok"":false,""error"":" & JsonText(text) & tail & "}"
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
  ' Closing the session discards anything unsaved and leaves the document unlocked.
  s.findById("wnd[0]/tbar[0]/okcd").Text = "/i"
  s.findById("wnd[0]").sendVKey 0
  For n = 1 To 50
    WScript.Sleep 100
    If Not SessionOpen() Then Exit For
  Next
  Set s = Nothing
End Sub

systemName = WScript.Arguments(0)
docNo = WScript.Arguments(1)
year = WScript.Arguments(2)
outDir = WScript.Arguments(3)
inFile = WScript.Arguments(4)
waitSeconds = CLng(WScript.Arguments(5))
Set s = Nothing
timedOut = False
Set fso = CreateObject("Scripting.FileSystemObject")
If Err.Number <> 0 Then Err.Clear : Finish False, "arguments", ""
client = CreateObject("WScript.Shell").Environment("PROCESS")("COUNTPOINT_SAP_CLIENT")
If Len(client) = 0 Then Finish False, "arguments", ""
If Len(docNo) < 9 Or Len(docNo) > 10 Or Len(year) <> 4 Then Finish False, "arguments", ""
text = fso.OpenTextFile(outDir & "\" & inFile, 1).ReadAll
If Err.Number <> 0 Then Err.Clear : Finish False, "in-file-missing", ""
Set wanted = CreateObject("Scripting.Dictionary")
lines = Split(Replace(text, vbCr, ""), vbLf)
For i = 0 To UBound(lines)
  parts = Split(lines(i), vbTab)
  If UBound(parts) = 1 Then
    If Len(Trim(parts(0))) > 0 Then wanted(UCase(Trim(parts(0)))) = CLng(Trim(parts(1)))
  End If
Next
If Err.Number <> 0 Or wanted.Count = 0 Then Err.Clear : Finish False, "in-file-invalid", ""

Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-not-running", ""
Set conn = Nothing
For i = 0 To app.Children.Count - 1
  If app.Children(CInt(i)).Children.Count > 0 Then
    If app.Children(CInt(i)).Children(0).Info.SystemName = systemName And app.Children(CInt(i)).Children(0).Info.Client = client Then Set conn = app.Children(CInt(i)) : Exit For
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
For i = 1 To 300
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
If s.Info.SystemName <> systemName Or s.Info.Client <> client Then Finish False, "wrong-system", ""
Err.Clear
' Like the other PI scripts, this one only runs on an English logon (SAP's messages are passed on as read), so nothing
' is filled unless the session is in English.
Dim logonLanguage
logonLanguage = ""
logonLanguage = UCase(Trim(CStr(s.Info.Language)))
Err.Clear
If logonLanguage <> "EN" And logonLanguage <> "E" Then Finish False, "language-not-supported", ""

s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMI04"
s.findById("wnd[0]").sendVKey 0
WaitIdle
If Err.Number <> 0 Or s.Info.Transaction <> "MI04" Then Err.Clear : Finish False, "no-access-mi04", ""
s.findById("wnd[0]/usr/ctxtRM07I-IBLNR").Text = docNo
s.findById("wnd[0]/usr/txtRM07I-GJAHR").Text = year
s.findById("wnd[0]").sendVKey 0
WaitIdle
' Warnings (e.g. M7 730: count date differs from the planned date) are confirmed with Enter; errors stop.
For i = 1 To 3
  If CStr(s.Info.ScreenNumber) <> "701" Then Exit For
  If s.findById("wnd[0]/sbar").MessageType <> "W" Then Exit For
  s.findById("wnd[0]").sendVKey 0
  WaitIdle
Next
If CStr(s.Info.ScreenNumber) <> "731" Then Err.Clear : Finish False, "sap: " & s.findById("wnd[0]/sbar").Text, ""

' Every page: each item takes two screen rows (material, then description).
Set filled = CreateObject("Scripting.Dictionary")
For page = 1 To 100
  For r = 0 To 60 Step 2
    Set field = s.findById(SUB_AREA & "ctxtISEG-MATNR[" & r & ",5]")
    If Err.Number <> 0 Then Err.Clear : Exit For
    material = UCase(Trim(field.Text))
    If Len(material) > 0 And Not filled.Exists(material) Then
      If Not wanted.Exists(material) Then Finish False, "unexpected-material: " & material, ""
      qty = wanted(material)
      If qty = 0 Then
        s.findById(SUB_AREA & "txtISEG-ERFMG[" & r & ",77]").Text = ""
        s.findById(SUB_AREA & "chkISEG-XNULL[" & r & ",112]").Selected = True
      Else
        s.findById(SUB_AREA & "txtISEG-ERFMG[" & r & ",77]").Text = CStr(qty)
        s.findById(SUB_AREA & "chkISEG-XNULL[" & r & ",112]").Selected = False
      End If
      If Err.Number <> 0 Then Err.Clear : Finish False, "fill-failed: " & material, ""
      filled(material) = qty
    End If
  Next
  If filled.Count >= wanted.Count Then Exit For
  ' Enter confirms the page, Page Down shows the next items.
  s.findById("wnd[0]").sendVKey 0
  WaitIdle
  s.findById("wnd[0]").sendVKey 82
  WaitIdle
  If Err.Number <> 0 Then Err.Clear : Exit For
Next
If filled.Count <> wanted.Count Then Finish False, "items-not-found", ""
s.findById("wnd[0]").sendVKey 0
WaitIdle
If s.findById("wnd[0]/sbar").MessageType = "E" Then Finish False, "sap: " & s.findById("wnd[0]/sbar").Text, ""
Err.Clear

' Hand over to the user: Save.
s.findById("wnd[0]").Restore
s.findById("wnd[0]").SetFocus
WScript.StdOut.WriteLine "{""stage"":""waiting""}"
For i = 1 To waitSeconds * 2
  WScript.Sleep 500
  If Not SessionOpen() Then Set s = Nothing : Finish False, "cancelled", ""
  If Not s.Busy Then
    If CStr(s.Info.ScreenNumber) = "701" Then Exit For
  End If
  Err.Clear
Next
If i > waitSeconds * 2 Then
  ' No Save seen in time: the user may have saved and gone on to another screen. Open popups are cancelled (as
  ' CloseOwnSession does; nothing is saved by that) and the items are read back below, so the answer is what SAP has.
  timedOut = True
  WaitIdle
  Err.Clear
  Do While s.Children.Count > 1
    s.findById("wnd[" & (s.Children.Count - 1) & "]").sendVKey 12
    WaitIdle
    If Err.Number <> 0 Then Exit Do
  Loop
  Err.Clear
End If
WaitIdle
message = s.findById("wnd[0]/sbar").Text

' Read the items back (display only) and check every one is counted with the right quantity.
s.findById("wnd[0]/tbar[0]/okcd").Text = "/nZMS_COUNT_SERIAL"
s.findById("wnd[0]").sendVKey 0
WaitIdle
s.findById("wnd[0]/usr/ctxtP_IBLNR").Text = docNo
s.findById("wnd[0]/usr/txtP_GJAHR").Text = year
s.findById("wnd[0]").sendVKey 8
WaitIdle
Set list = s.findById("wnd[0]/usr/cntlGRID1/shellcont/shell")
If Err.Number <> 0 Then Err.Clear : Finish False, "verify-failed", ""
wrong = ""
For row = 0 To list.RowCount - 1
  material = UCase(list.GetCellValue(row, "MATNR"))
  If wanted.Exists(material) Then
    If list.GetCellValue(row, "XZAEL") <> "X" Or CDbl(list.GetCellValue(row, "MENGE")) <> wanted(material) Then wrong = wrong & material & " "
  End If
Next
If Err.Number <> 0 Then Err.Clear : Finish False, "verify-failed", ""
If Len(wrong) > 0 Then Finish False, "not-counted: " & Trim(wrong), ""
Finish True, message, ",""items"":" & wanted.Count
