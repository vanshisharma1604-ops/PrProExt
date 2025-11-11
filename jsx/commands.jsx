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

function ensureBins(args) {
  var sceneId = args && args.sceneId;
  if (!sceneId) return { ok:false, error:"missing_sceneId" };
  if (!app.project) return { ok:false, error:"no_project" };
  var bins = getSceneBins(sceneId);
  return { ok:true, bins:3, scene: bins.scene ? bins.scene.name : sceneId };
}

function importAndPlaceInBins(args) {
  var sceneId = args && args.sceneId;
  if (!sceneId) return { ok:false, error:"missing_sceneId" };
  var watchDir = args ? args.watchDir : null;
  var bins = getSceneBins(sceneId);
  var counts = { WS:0, MS:0, CU:0 };
  if (!watchDir) {
    return { ok:true, imported:counts, skipped:true };
  }
  var folder = new Folder(watchDir);
  if (!folder.exists) {
    return { ok:false, error:"watch_dir_missing" };
  }
  var types = ["WS","MS","CU"];
  for (var t=0; t<types.length; t++){
    var type = types[t];
    var prefix = (sceneId + "_" + type + "_").toUpperCase();
    var files = folder.getFiles(function(entry){
      if (!(entry instanceof File)) return false;
      return entry.name.toUpperCase().indexOf(prefix) === 0;
    });
    for (var i=0; i<files.length; i++){
      var file = files[i];
      var path = file.fsName;
      var existing = findItemByPath(app.project.rootItem, path);
      if (!existing) {
        app.project.importFiles([path], true, bins[type], false);
        existing = findItemByPath(app.project.rootItem, path);
      }
      if (existing) {
        try { existing.moveBin(bins[type]); } catch(eMove) {}
        counts[type] = counts[type] + 1;
      }
    }
  }
  return { ok:true, imported:counts };
}

function addClipMarkersForScene(args) {
  var sceneId = args && args.sceneId;
  if (!sceneId) return { ok:false, error:"missing_sceneId" };
  var bins = getSceneBins(sceneId);
  var types = ["WS","MS","CU"];
  var total = 0;
  for (var t=0; t<types.length; t++){
    var type = types[t];
    var bin = bins[type];
    if (!bin) continue;
    for (var i=0; i<bin.children.numItems; i++){
      var item = bin.children[i];
      if (!item || item.type === ProjectItemType.BIN) continue;
      if (!item.getMarkers) continue;
      var markers = item.getMarkers();
      if (!markers) continue;
      var expectedComment = "Light:ShotID=" + sceneId + " Coverage=" + type;
      var matched = 0;
      if (markers.numMarkers && markers.numMarkers > 0){
        var existing = markers.getFirstMarker();
        while (existing){
          if (existing.comments === expectedComment) {
            matched++;
          }
          existing = markers.getNextMarker(existing);
        }
      }
      if (matched === 0){
        var marker = markers.createMarker(0);
        marker.name = sceneId + " " + type;
        marker.comments = expectedComment;
        matched = 1;
      }
      total += matched;
    }
  }
  return { ok:true, markers:total };
}

function insertAiPrevis(args) {
  var seq = app.project.activeSequence;
  if (!seq) return { ok:false, error:"no_active_sequence" };
  var sceneId = args && args.sceneId ? args.sceneId : "SCENE";
  var durationSec = args && args.durationSec ? args.durationSec : 8;
  var bins = getSceneBins(sceneId);
  var sourceItem = null;
  if (args && args.path) {
    try {
      var file = new File(args.path);
      if (file.exists) {
        var path = file.fsName;
        sourceItem = findItemByPath(app.project.rootItem, path);
        if (!sourceItem) {
          app.project.importFiles([path], true, bins.CU, false);
          sourceItem = findItemByPath(app.project.rootItem, path);
        }
      }
    } catch(eFile) {}
  }
  if (!sourceItem) {
    sourceItem = createPrevisSlate(sceneId, durationSec, bins);
  }
  if (!sourceItem) {
    return { ok:false, error:"previs_source_missing" };
  }

  var trackIndex = 1;
  var track = ensureVideoTrack(seq, trackIndex);
  if (!track) return { ok:false, error:"missing_track" };

  var position = seq.getPlayerPosition ? seq.getPlayerPosition() : null;
  var startTicks = position && position.ticks ? position.ticks : seq.timebase.convertTimecodeToTicks("00;00;00;00");

  try {
    track.insertClip(sourceItem, startTicks);
  } catch(eInsert) {
    return { ok:false, error:"insert_failed" };
  }

  var insertedClip = null;
  for (var i=0; i<track.clips.numItems; i++){
    var clip = track.clips[i];
    if (clip && clip.start && clip.start.ticks === startTicks) {
      insertedClip = clip;
      break;
    }
  }

  if (insertedClip) {
    try { insertedClip.name = "AI PREVIS"; } catch(eName) {}
    if (insertedClip.projectItem) {
      try { insertedClip.projectItem.name = "AI PREVIS — " + sceneId + " CU " + durationSec + "s"; } catch(eRename) {}
      addAiMarker(insertedClip.projectItem);
    }
  } else {
    addAiMarker(sourceItem);
  }

  return { ok:true, clipName: sourceItem ? sourceItem.name : "AI PREVIS", track: trackIndex };
}

function replaceAiPrevisWithReal(args) {
  var sceneId = args && args.sceneId ? args.sceneId : "SCENE";
  var seq = app.project.activeSequence;
  if (!seq) return { ok:false, error:"no_active_sequence" };
  var previs = findPrevisClip(seq);
  if (!previs) return { ok:false, error:"no_previs" };
  var bins = getSceneBins(sceneId);
  var realItem = selectRealCuClip(bins.CU);
  if (!realItem) return { ok:false, error:"no_real_clip" };

  var startTicks = previs.clip.start ? previs.clip.start.ticks : null;
  if (startTicks === null) startTicks = seq.timebase.convertTimecodeToTicks("00;00;00;00");

  var baseTrack = ensureVideoTrack(seq, 0);
  if (!baseTrack) return { ok:false, error:"missing_track" };

  try {
    baseTrack.overwriteClip(realItem, startTicks);
  } catch(overwriteErr) {
    try {
      baseTrack.insertClip(realItem, startTicks);
    } catch(insertErr) {
      return { ok:false, error:"replace_failed" };
    }
  }

  try { previs.clip.remove(0, 0); } catch(removeErr) {}

  return { ok:true, clipName: realItem.name };
}

function computeRoundTrip(args) {
  var sceneId = args && args.sceneId ? args.sceneId : "SCENE";
  var seq = app.project.activeSequence;
  var bins = getSceneBins(sceneId);
  var coverage = {
    WS: binHasClips(bins.WS),
    MS: binHasClips(bins.MS),
    CU: binHasClips(bins.CU)
  };
  var markers = 0;

  if (seq && seq.markers) {
    var seqMarker = seq.markers.getFirstMarker();
    while (seqMarker) {
      markers++;
      seqMarker = seq.markers.getNextMarker(seqMarker);
    }
  }

  markers += countClipMarkers(bins.WS, sceneId);
  markers += countClipMarkers(bins.MS, sceneId);
  markers += countClipMarkers(bins.CU, sceneId);

  var fpsValue = getSequenceFps(seq);
  var aiPrevisPresence = !!findPrevisClip(seq);

  return { ok:true, coverage:coverage, markers:markers, fps:fpsValue, aiPrevis:aiPrevisPresence };
}

function getSceneBins(sceneId) {
  var root = app.project.rootItem;
  var sceneBin = ensureBin(root, sceneId);
  return {
    scene: sceneBin,
    WS: ensureBin(sceneBin, "WS"),
    MS: ensureBin(sceneBin, "MS"),
    CU: ensureBin(sceneBin, "CU")
  };
}

function ensureBin(parent, name) {
  if (!parent) return null;
  for (var i=0; i<parent.children.numItems; i++){
    var child = parent.children[i];
    if (child && child.type === ProjectItemType.BIN && child.name === name) {
      return child;
    }
  }
  try {
    return parent.createBin(name);
  } catch(eCreate) {
    return null;
  }
}

function ensureVideoTrack(seq, index) {
  if (!seq || !seq.videoTracks) return null;
  while (seq.videoTracks.numTracks <= index) {
    try { seq.videoTracks.addTrack(); } catch(eAdd) { break; }
  }
  return seq.videoTracks.numTracks > index ? seq.videoTracks[index] : null;
}

function createPrevisSlate(sceneId, durationSec, bins) {
  try {
    if (!app.project || !app.project.createNewBlackVideo) return null;
    var slate = app.project.createNewBlackVideo();
    if (!slate) return null;
    slate.name = "AI PREVIS — " + sceneId + " CU " + durationSec + "s";
    if (bins && bins.CU) {
      try { slate.moveBin(bins.CU); } catch(eMove) {}
    }
    addAiMarker(slate);
    return slate;
  } catch(e) {
    return null;
  }
}

function addAiMarker(projectItem) {
  if (!projectItem || !projectItem.getMarkers) return;
  var markers = projectItem.getMarkers();
  if (!markers) return;
  var hasMarker = false;
  if (markers.numMarkers && markers.numMarkers > 0){
    var existing = markers.getFirstMarker();
    while (existing){
      if (existing.name === "AI PREVIS" || existing.comments === "AI PREVIS") {
        hasMarker = true;
        break;
      }
      existing = markers.getNextMarker(existing);
    }
  }
  if (!hasMarker) {
    var marker = markers.createMarker(0);
    marker.name = "AI PREVIS";
    marker.comments = "AI PREVIS";
  }
}

function findPrevisClip(seq) {
  if (!seq || !seq.videoTracks) return null;
  for (var t=0; t<seq.videoTracks.numTracks; t++){
    var track = seq.videoTracks[t];
    for (var i=0; i<track.clips.numItems; i++){
      var clip = track.clips[i];
      var clipName = clip && clip.name ? clip.name : (clip.projectItem ? clip.projectItem.name : "");
      if (clipName && clipName.toUpperCase().indexOf("AI PREVIS") === 0) {
        return { clip: clip, trackIndex: t };
      }
    }
  }
  return null;
}

function selectRealCuClip(cuBin) {
  if (!cuBin) return null;
  var selection = null;
  var longest = 0;
  for (var i=0; i<cuBin.children.numItems; i++){
    var item = cuBin.children[i];
    if (!item || item.type === ProjectItemType.BIN) continue;
    var duration = 0;
    try {
      if (item.getMediaDuration) {
        duration = item.getMediaDuration();
      } else if (item.duration) {
        duration = item.duration.ticks || 0;
      }
    } catch(eDuration) {}
    if (!selection || duration > longest) {
      selection = item;
      longest = duration;
    }
  }
  return selection;
}

function binHasClips(bin) {
  if (!bin) return false;
  for (var i=0; i<bin.children.numItems; i++){
    var item = bin.children[i];
    if (item && item.type !== ProjectItemType.BIN) return true;
  }
  return false;
}

function countClipMarkers(bin, sceneId) {
  if (!bin) return 0;
  var total = 0;
  for (var i=0; i<bin.children.numItems; i++){
    var item = bin.children[i];
    if (!item || item.type === ProjectItemType.BIN || !item.getMarkers) continue;
    var markers = item.getMarkers();
    if (!markers) continue;
    var marker = markers.getFirstMarker();
    while (marker){
      if (marker.comments && (!sceneId || marker.comments.indexOf("Light:ShotID=" + sceneId) === 0)) {
        total++;
      }
      marker = markers.getNextMarker(marker);
    }
  }
  return total;
}

function getSequenceFps(seq) {
  if (!seq) return null;
  try {
    if (seq.timebase && seq.timebase.framesPerSecond) {
      return seq.timebase.framesPerSecond;
    }
    if (seq.getSettings) {
      var settings = seq.getSettings();
      if (settings && settings.videoFrameRate) {
        var parsed = parseFloat(settings.videoFrameRate);
        if (!isNaN(parsed)) return parsed;
      }
    }
  } catch(e) {}
  if (seq && seq.videoTracks && seq.videoTracks.numTracks > 0){
    var track = seq.videoTracks[0];
    if (track.clips.numItems > 0){
      var item = track.clips[0].projectItem;
      try {
        if (item && item.getFootageInterpretation) {
          var interp = item.getFootageInterpretation();
          if (interp && interp.frameRate) return interp.frameRate;
        }
      } catch(eInterp) {}
    }
  }
  return null;
}

