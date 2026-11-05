' CountPoint - SAP status (read only).
' Reports whether SAP GUI is running, scripting is enabled and which sessions
' are logged in, busy or showing a popup. It only READS properties: it never
' opens, closes or changes a session. Output: one JSON line on stdout.
Option Explicit
On Error Resume Next

Dim sapGui, engine, conn, sess, info, i, j, connJson, sessJson, item, connCount, sessCount

Function JsonText(value)
  Dim s
  s = CStr(value)
  s = Replace(s, "\", "\\")
  s = Replace(s, """", "\""")
  s = Replace(s, vbCr, " ")
  s = Replace(s, vbLf, " ")
  s = Replace(s, vbTab, " ")
  JsonText = """" & s & """"
End Function

Function JsonBool(value)
  If value Then JsonBool = "true" Else JsonBool = "false"
End Function

Set sapGui = GetObject("SAPGUI")
If Err.Number <> 0 Or Not IsObject(sapGui) Then
  WScript.StdOut.WriteLine "{""running"":false}"
  WScript.Quit 0
End If

Err.Clear
Set engine = sapGui.GetScriptingEngine
If Err.Number <> 0 Or Not IsObject(engine) Then
  WScript.StdOut.WriteLine "{""running"":true,""scripting"":false}"
  WScript.Quit 0
End If

connJson = ""
connCount = engine.Children.Count
For i = 0 To connCount - 1
  Err.Clear
  Set conn = engine.Children(CInt(i))
  If Err.Number = 0 Then
    sessJson = ""
    sessCount = conn.Children.Count
    For j = 0 To sessCount - 1
      Err.Clear
      Set sess = conn.Children(CInt(j))
      If Err.Number = 0 Then
        ' A busy session is never queried further: reading Info could wait for it.
        If sess.Busy Then
          item = "{""busy"":true}"
        Else
          Set info = sess.Info
          item = "{""busy"":false,""popup"":" & JsonBool(sess.Children.Count > 1) & _
            ",""system"":" & JsonText(info.SystemName) & ",""client"":" & JsonText(info.Client) & _
            ",""user"":" & JsonText(info.User) & ",""transaction"":" & JsonText(info.Transaction) & "}"
          If Err.Number <> 0 Then item = "{""busy"":true}"
        End If
        If sessJson <> "" Then sessJson = sessJson & ","
        sessJson = sessJson & item
      End If
    Next
    If connJson <> "" Then connJson = connJson & ","
    connJson = connJson & "{""disabledByServer"":" & JsonBool(conn.DisabledByServer) & ",""sessions"":[" & sessJson & "]}"
  End If
Next

WScript.StdOut.WriteLine "{""running"":true,""scripting"":true,""connections"":[" & connJson & "]}"
WScript.Quit 0
