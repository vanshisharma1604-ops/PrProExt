function addMarker(args) {
  var seq = app.project.activeSequence;
  if (!seq) return { ok:false, error:"no_active_sequence" };
  var t = timeFrom(args.at || "00;00;05;00", seq);
  var m = seq.markers.createMarker(t.ticks);
  if (args.name) m.name = args.name;
  if (args.comment) m.comments = args.comment;
  return { ok:true, at: t.timecode };
}

function insertClip(args) {
  if (!args || !args.path) return { ok:false, error:"missing_path" };
  var seq = app.project.activeSequence;
  if (!seq) return { ok:false, error:"no_active_sequence" };
  var path = args.path;
  var destTrack = args.track || 0;

  // import (idempotent enough for v0.1)
  app.project.importFiles([path], true, app.project.rootItem, false);

  var item = findItemByPath(app.project.rootItem, path);
  if (!item) return { ok:false, error:"import_failed" };

  var t = timeFrom(args.at || "00;00;10;00", seq);
  seq.videoTracks[destTrack].insertClip(item, t.ticks);
  return { ok:true, placedAt: t.timecode, track: destTrack };
}

function findItemByPath(root, path) {
  for (var i=0;i<root.children.numItems;i++){
    var ch = root.children[i];
    if (ch.type === ProjectItemType.BIN) {
      var got = findItemByPath(ch, path); if (got) return got;
    } else if (ch.getMediaPath && ch.getMediaPath() === path) return ch;
  }
  return null;
}

function timeFrom(tc, seq){
  // naive; adjust to your timebase helper if available
  return { timecode: tc, ticks: seq.timebase.convertTimecodeToTicks(tc) };
}

