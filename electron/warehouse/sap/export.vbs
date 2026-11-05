' CountPoint - SAP export (read only).
' Usage: export.vbs <report> <outDir> <outFile> [stockType]
'   report    = mb52 | iq09     (display transactions only)
'   stockType = 01 (unrestricted) | 07 (blocked)   - iq09 only
' Opens its OWN session (never types into the user's session), runs the report for
' plant D301, saves the list as tab-separated UTF-8 text and closes its session again.
' Output: one JSON line {"ok":true,"rows":N} or {"ok":false,"error":"..."}.
Option Explicit
On Error Resume Next

Const PLANT = "D301"
Dim report, outDir, outFile, stockType, app, conn, s, base, i, before, beforeIds, fso, rows, grid

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
  Dim ownId : ownId = s.Id
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

Function FindGridIn(obj)
  Dim k, ch, found
  Set FindGridIn = Nothing
  For k = 0 To obj.Children.Count - 1
    Set ch = obj.Children(CInt(k))
    If ch.Type = "GuiShell" Then
      If ch.SubType = "GridView" Then
        Set FindGridIn = ch
        Exit Function
      End If
    End If
    If ch.ContainerType Then
      Set found = FindGridIn(ch)
      If Not found Is Nothing Then
        Set FindGridIn = found
        Exit Function
      End If
    End If
  Next
End Function

' The "Save list in file" popup: choose tab-separated text, then name the file.
Function SaveAsTabText()
  Dim k, radio, chosen
  SaveAsTabText = False
  chosen = False
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
  SaveAsTabText = fso.FileExists(outDir & "\" & outFile)
End Function

' SAP pre-fills selection fields from the user's parameter memory (e.g. the last storage
' location), so every field that matters is set explicitly.
Sub SetFields(names, value)
  Dim name
  For Each name In names
    s.findById("wnd[0]/usr/" & name).Text = value
  Next
End Sub

report = LCase(WScript.Arguments(0))
outDir = WScript.Arguments(1)
outFile = WScript.Arguments(2)
stockType = ""
If WScript.Arguments.Count > 3 Then stockType = WScript.Arguments(3)
rows = 0
Set s = Nothing
Set fso = CreateObject("Scripting.FileSystemObject")
If report <> "mb52" And report <> "iq09" Then Finish False, "report-not-allowed"
If report = "iq09" And stockType <> "01" And stockType <> "07" Then Finish False, "invalid-stock-type"
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

' Ask an idle session of the connection to create a new one; the user's screen is not typed into.
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
WaitIdle
s.findById("wnd[0]").Iconify
Err.Clear

If report = "mb52" Then
  s.findById("wnd[0]/tbar[0]/okcd").Text = "/nMB52"
  s.findById("wnd[0]").sendVKey 0
  WaitIdle
  s.findById("wnd[0]/usr/ctxtWERKS-LOW").Text = PLANT
  SetFields Array("ctxtWERKS-HIGH", "ctxtMATNR-LOW", "ctxtMATNR-HIGH", "ctxtLGORT-LOW", "ctxtLGORT-HIGH", "ctxtCHARG-LOW", "ctxtCHARG-HIGH", _
    "ctxtMATART-LOW", "ctxtMATART-HIGH", "ctxtMATKLA-LOW", "ctxtMATKLA-HIGH", "ctxtEKGRUP-LOW", "ctxtEKGRUP-HIGH", "ctxtSO_SOBKZ-LOW", "ctxtSO_SOBKZ-HIGH"), ""
  ' The global /DEFAULT layout gives the classic list that %pc can save.
  s.findById("wnd[0]/usr/ctxtP_VARI").Text = "/DEFAULT"
  s.findById("wnd[0]/usr/chkPA_SOND").Selected = False
  s.findById("wnd[0]/usr/chkNEGATIV").Selected = False
  s.findById("wnd[0]/usr/chkXMCHB").Selected = False
  s.findById("wnd[0]/usr/chkNOZERO").Selected = True
  s.findById("wnd[0]/usr/chkNOVALUES").Selected = False
  s.findById("wnd[0]/usr/radPA_FLT").Select
  If Err.Number <> 0 Then Err.Clear : Finish False, "mb52-screen-changed"
  s.findById("wnd[0]").sendVKey 8
  WaitIdle
  If CStr(s.Info.ScreenNumber) = "1000" Then
    ' Still on the selection screen: nothing in stock.
    Err.Clear
    rows = 0
    Finish True, ""
  End If
  Err.Clear
  s.findById("wnd[0]/tbar[0]/okcd").Text = "%pc"
  s.findById("wnd[0]").sendVKey 0
  WaitIdle
  If Not SaveAsTabText() Then Err.Clear : Finish False, "export-failed"
Else
  s.findById("wnd[0]/tbar[0]/okcd").Text = "/nIQ09"
  s.findById("wnd[0]").sendVKey 0
  WaitIdle
  s.findById("wnd[0]/usr/ctxtWERK-LOW").Text = PLANT
  s.findById("wnd[0]/usr/ctxtLBBSA-LOW").Text = stockType
  SetFields Array("ctxtWERK-HIGH", "ctxtLBBSA-HIGH", "ctxtEQUNR-LOW", "ctxtEQUNR-HIGH", "ctxtMATNR-LOW", "ctxtMATNR-HIGH", "txtSERNR-LOW", "txtSERNR-HIGH", _
    "ctxtLAGER-LOW", "ctxtLAGER-HIGH", "ctxtCHARGE-LOW", "ctxtCHARGE-HIGH", "ctxtSOBKZ-LOW", "ctxtSOBKZ-HIGH"), ""
  s.findById("wnd[0]/usr/ctxtVARIANT").Text = "/STATUS"
  If Err.Number <> 0 Then Err.Clear : Finish False, "iq09-screen-changed"
  s.findById("wnd[0]").sendVKey 8
  WaitIdle
  Set grid = FindGridIn(s.findById("wnd[0]/usr"))
  If grid Is Nothing Then Err.Clear : rows = 0 : Finish True, ""
  rows = grid.RowCount
  ' List > Save > File... (position-based, so it also works with a Danish SAP logon).
  s.findById("wnd[0]/mbar/menu[0]/menu[10]/menu[2]").Select
  WaitIdle
  If Not SaveAsTabText() Then Err.Clear : Finish False, "export-failed"
End If

If report = "mb52" Then rows = -1
Finish True, ""
