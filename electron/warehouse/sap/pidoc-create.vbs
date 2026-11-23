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
' Output: {"ok":true,"title":"..."} or {"ok":false,"error":"..."}.
Option Explicit
On Error Resume Next

Const PLANT = "D301"
Dim systemName, mode, sloc, stockType, reference, outDir, outFile, waitSeconds, material, fromClipboard
Dim app, conn, base, s, i, before, beforeIds, fso, ownId, title

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
    WScript.StdOut.WriteLine "{""ok"":true,""title"":" & JsonText(title) & "}"
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
Set fso = CreateObject("Scripting.FileSystemObject")
If Err.Number <> 0 Then Err.Clear : Finish False, "arguments"
If mode <> "test" And mode <> "create" Then Finish False, "invalid-mode"
If stockType <> "unrestricted" And stockType <> "blocked" Then Finish False, "invalid-stock-type"
If Len(sloc) <> 4 Or Len(material) = 0 Or Len(reference) = 0 Or Len(reference) > 16 Then Finish False, "arguments"
If Not fso.FolderExists(outDir) Then Finish False, "out-dir-missing"
If fso.FileExists(outDir & "\" & outFile) Then fso.DeleteFile outDir & "\" & outFile

Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then Err.Clear : Finish False, "sap-not-running"
' Only a connection to the requested system; never the first one that happens to be open.
Set conn = Nothing
For i = 0 To app.Children.Count - 1
  If app.Children(CInt(i)).Children.Count > 0 Then
    If app.Children(CInt(i)).Children(0).Info.SystemName = systemName Then Set conn = app.Children(CInt(i))
  End If
Next
Err.Clear
If conn Is Nothing Then Finish False, "not-logged-in-" & systemName
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
If s.Info.SystemName <> systemName Then Finish False, "wrong-system"
Err.Clear
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
s.findById("wnd[0]/usr/txtINVNU").Text = reference
s.findById("wnd[0]/usr/txtXBLNI").Text = reference
If Err.Number <> 0 Then Err.Clear : Finish False, "mi31-screen-changed"
Check "wnd[0]/usr/txtINVNU", reference
Check "wnd[0]/usr/ctxtR_MATNR-LOW", material
Check "wnd[0]/usr/ctxtR_WERKS-LOW", PLANT
Check "wnd[0]/usr/ctxtR_LGORT-LOW", sloc
If Not s.findById("wnd[0]/usr/chkXIMAT").Selected Then Finish False, "field-not-set: XIMAT"

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
For i = 1 To waitSeconds * 2
  WScript.Sleep 500
  If Not SessionOpen() Then Set s = Nothing : Finish False, "cancelled"
  ' Pressed F8 = the selection screen is gone without a popup (the multiple selection is a popup, not F8).
  If Not s.Busy Then
    If s.Children.Count = 1 And (CStr(s.Info.ScreenNumber) <> "1000" Or s.Info.Transaction <> "MI31") Then Exit For
  End If
  Err.Clear
Next
If i > waitSeconds * 2 Then Finish False, "timeout"
WaitIdle
title = s.findById("wnd[0]").Text
If s.Info.Transaction <> "MI31" Then Finish False, "left-mi31"
If InStr(1, title, "Created", vbTextCompare) = 0 Then Finish False, "not-created: " & title & " " & s.findById("wnd[0]/sbar").Text

' The created documents, found by the Physical Inventory Number CountPoint stamped on them (read only).
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
If CStr(s.Info.ScreenNumber) = "1000" Then Err.Clear : Finish False, "created-but-not-found"
If Not SaveList() Then Err.Clear : Finish False, "read-failed"
Finish True, ""

Sub SetFields(names, value)
  Dim name
  For Each name In names
    s.findById("wnd[0]/usr/" & name).Text = value
  Next
End Sub
