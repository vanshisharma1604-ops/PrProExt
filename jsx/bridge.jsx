//@target premierepro
#include "commands.jsx"
#include "snapshot.jsx"

function __light_exec(cmdJSON){
  try{
    var cmd = JSON.parse(cmdJSON);
    if (cmd.type === "add_marker")  return JSON.stringify(addMarker(cmd.args||{}));
    if (cmd.type === "insert_clip") return JSON.stringify(insertClip(cmd.args||{}));
    if (cmd.type === "demo.ensureBins") return JSON.stringify(ensureBins(cmd.args||{}));
    if (cmd.type === "demo.importAndPlaceInBins") return JSON.stringify(importAndPlaceInBins(cmd.args||{}));
    if (cmd.type === "demo.addClipMarkersForScene") return JSON.stringify(addClipMarkersForScene(cmd.args||{}));
    if (cmd.type === "demo.insertAiPrevis") return JSON.stringify(insertAiPrevis(cmd.args||{}));
    if (cmd.type === "demo.replaceAiPrevisWithReal") return JSON.stringify(replaceAiPrevisWithReal(cmd.args||{}));
    if (cmd.type === "demo.computeRoundTrip") return JSON.stringify(computeRoundTrip(cmd.args||{}));
    return JSON.stringify({ ok:false, error:"unknown_command" });
  }catch(e){ return JSON.stringify({ ok:false, error: e.toString() }); }
}

