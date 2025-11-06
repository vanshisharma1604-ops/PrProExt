function __light_snapshot(){
  var seq = app.project.activeSequence;
  if (!seq) return JSON.stringify({ ok:false, reason:"no_sequence" });

  var tracks = [];
  var vt = seq.videoTracks;
  for (var t=0; t<vt.numTracks; t++){
    var tr = vt[t], items=[];
    for (var i=0; i<tr.clips.numItems; i++){
      var c = tr.clips[i];
      items.push({
        name: c.name,
        start: c.start.ticks,
        end: c.end.ticks,
        path: (c.projectItem && c.projectItem.getMediaPath) ? c.projectItem.getMediaPath() : null
      });
    }
    tracks.push({ kind:"video", index:t, items:items });
  }
  return JSON.stringify({ ok:true, seqName: seq.name, tracks: tracks, ts: (new Date()).getTime() });
}

