//@target premierepro
#include "commands.jsx"
#include "snapshot.jsx"

function __light_exec(cmdJSON){
  try{
    var cmd = JSON.parse(cmdJSON);
    if (cmd.type === "add_marker")  return JSON.stringify(addMarker(cmd.args||{}));
    if (cmd.type === "insert_clip") return JSON.stringify(insertClip(cmd.args||{}));
    return JSON.stringify({ ok:false, error:"unknown_command" });
  }catch(e){ return JSON.stringify({ ok:false, error: e.toString() }); }
}

