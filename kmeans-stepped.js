(function () {
  var NUM_POINTS = 300;
  var PLAY_INTERVAL_MS = 2000;
  var TAU = 30;

  var $vis = document.getElementById("kmeans-vis");
  var $btnPrev = document.getElementById("btn-prev");
  var $btnNext = document.getElementById("btn-next");
  var $btnPlay = document.getElementById("btn-play");
  var $status = document.getElementById("status-text");
  var $numClusters = document.getElementById("num-clusters");
  var $numCentroids = document.getElementById("num-centroids");
  var $newPoints = document.getElementById("new-points");
  var $newCentroids = document.getElementById("new-centroids");

  var size = Math.min($vis.clientWidth, $vis.clientHeight) || 540;
  var width = size;
  var height = size;

  var svg = d3
    .select("#kmeans-vis")
    .append("svg")
    .attr("width", width)
    .attr("height", height);
  var pointsGroup = svg.append("g").attr("id", "points");
  var centroidsGroup = svg.append("g").attr("id", "centroids");

  var colors = d3.scale.category10();

  // Mutable state
  var points = [];        // [[x, y], ...]
  var centroids = [];     // [[x, y], ...]
  var assignments = [];   // assignments[i] = centroid index for point i
  var assignmentsOld = null;
  var phase = "init";     // 'init' | 'assign' | 'update' | 'check' | 'done'
  var iter = 0;
  var converged = false;
  var history = [];       // stack of snapshots for Previous
  var playing = false;
  var playTimer = null;

  // ---------- helpers ----------
  function distance(a, b) {
    return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
  }
  function clone(arr) {
    return arr.map(function (a) { return a.slice(); });
  }
  function arraysEqual(a, b) {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function randomCenter(n) { return Math.random() * n; }
  function clamp(val, lo, hi) {
    var x = parseInt(val, 10);
    if (isNaN(x)) return lo;
    return Math.max(lo, Math.min(hi, x));
  }

  // ---------- snapshot / restore ----------
  function snapshot() {
    return {
      centroids: clone(centroids),
      assignments: assignments.slice(),
      assignmentsOld: assignmentsOld ? assignmentsOld.slice() : null,
      phase: phase,
      iter: iter,
      converged: converged,
    };
  }
  function restore(s) {
    centroids = clone(s.centroids);
    assignments = s.assignments.slice();
    assignmentsOld = s.assignmentsOld ? s.assignmentsOld.slice() : null;
    phase = s.phase;
    iter = s.iter;
    converged = s.converged;
  }

  // ---------- generation ----------
  function generatePoints() {
    var randomness = 30;
    var variance = randomness / 2 + 5;
    var clustered = (100 - 0.8 * randomness) / 100;
    var k = clamp($numClusters.value, 1, 8);
    points = [];
    for (var i = 0; i < k; i++) {
      var cx = randomCenter(width);
      var cy = randomCenter(height);
      var xN = d3.random.normal(cx, variance);
      var yN = d3.random.normal(cy, variance);
      var perCluster = Math.floor((clustered * NUM_POINTS) / k);
      for (var j = 0; j < perCluster; j++) {
        points.push([bounded(xN), bounded(yN)]);
      }
    }
    while (points.length < NUM_POINTS) {
      points.push([randomCenter(width), randomCenter(height)]);
    }
  }
  function bounded(fn) {
    var v = fn();
    while (v < 5 || v > width - 5) v = fn();
    return v;
  }
  function generateCentroids() {
    var k = clamp($numCentroids.value, 1, 8);
    centroids = [];
    for (var i = 0; i < k; i++) {
      centroids.push([randomCenter(width), randomCenter(height)]);
    }
  }

  // ---------- algorithm phases ----------
  function doAssign() {
    assignmentsOld = assignments.length ? assignments.slice() : null;
    var next = new Array(points.length);
    for (var i = 0; i < points.length; i++) {
      var minD = Infinity, minJ = 0;
      for (var j = 0; j < centroids.length; j++) {
        var d = distance(points[i], centroids[j]);
        if (d < minD) { minD = d; minJ = j; }
      }
      next[i] = minJ;
    }
    assignments = next;
  }
  function doUpdate() {
    var sums = centroids.map(function () { return [0, 0, 0]; }); // sx, sy, n
    for (var i = 0; i < points.length; i++) {
      var j = assignments[i];
      sums[j][0] += points[i][0];
      sums[j][1] += points[i][1];
      sums[j][2] += 1;
    }
    for (var j = 0; j < centroids.length; j++) {
      if (sums[j][2] > 0) {
        centroids[j] = [sums[j][0] / sums[j][2], sums[j][1] / sums[j][2]];
      }
    }
  }
  function doCheck() {
    converged = arraysEqual(assignments, assignmentsOld);
  }

  // ---------- step machine ----------
  function nextPhase() {
    // From the current phase, compute the next.
    if (phase === "init") return "assign";
    if (phase === "assign") return "update";
    if (phase === "update") return "check";
    if (phase === "check") return converged || iter >= TAU ? "done" : "assign";
    return "done";
  }

  function step() {
    if (phase === "done") return;
    history.push(snapshot());

    var next = nextPhase();
    if (next === "assign") {
      // entering a new iteration
      iter += 1;
      doAssign();
    } else if (next === "update") {
      doUpdate();
    } else if (next === "check") {
      doCheck();
    }
    phase = next;
    render();
  }

  function previous() {
    if (history.length === 0) return;
    var s = history.pop();
    restore(s);
    render();
  }

  function reset(opts) {
    stopPlay();
    if (opts && opts.points) generatePoints();
    if (opts && opts.centroids) generateCentroids();
    // Line 1: random assignment as part of initialization
    var k = centroids.length;
    assignments = points.map(function () { return Math.floor(Math.random() * k); });
    assignmentsOld = null;
    phase = "init";
    iter = 0;
    converged = false;
    history = [];
    render();
  }

  // ---------- rendering ----------
  function render() {
    renderPoints();
    renderCentroids();
    renderAlgo();
    renderStatus();
    renderButtons();
  }

  function renderPoints() {
    var sel = pointsGroup.selectAll("circle").data(points);
    sel.enter().append("circle").attr("r", 3);
    sel
      .attr("cx", function (d) { return d[0]; })
      .attr("cy", function (d) { return d[1]; })
      .attr("fill", function (d, i) {
        if (assignments.length === 0) return "#777";
        return colors(assignments[i]);
      });
    sel.exit().remove();
  }

  function renderCentroids() {
    var sel = centroidsGroup.selectAll("image").data(centroids);
    sel.enter()
      .append("image")
      .attr("xlink:href", "truck.svg")
      .attr("width", 28)
      .attr("height", 28);
    sel
      .transition()
      .duration(300)
      .attr("transform", function (d) {
        return "translate(" + (d[0] - 14) + "," + (d[1] - 14) + ")";
      });
    sel.exit().remove();
  }

  // Lines highlighted per phase
  var LINE_HIGHLIGHTS = {
    init: [1],
    assign: [3, 4, 5],
    update: [6, 7],
    check: [8, 9],
    done: [10],
  };
  function renderAlgo() {
    var lines = LINE_HIGHLIGHTS[phase] || [];
    document.querySelectorAll(".algo-line").forEach(function (el) {
      var n = parseInt(el.getAttribute("data-line"), 10);
      el.classList.toggle("active", lines.indexOf(n) !== -1);
    });
  }

  function renderStatus() {
    var msg;
    if (phase === "init") {
      msg = "Ready. Iteration 0 / " + TAU + ".";
    } else if (phase === "assign") {
      msg = "Iteration " + iter + ": assigning each point to nearest centroid.";
    } else if (phase === "update") {
      msg = "Iteration " + iter + ": moving each centroid to the mean of its points.";
    } else if (phase === "check") {
      msg = "Iteration " + iter + ": checking convergence — " +
        (converged ? "no change, will break." : "assignments changed, continuing.");
    } else if (phase === "done") {
      msg = "Done after " + iter + " iteration" + (iter === 1 ? "" : "s") +
        (converged ? " (converged)." : " (max τ reached).");
    }
    $status.textContent = msg;
  }

  function renderButtons() {
    $btnPrev.disabled = history.length === 0;
    $btnNext.disabled = phase === "done";
    if (phase === "done" && playing) stopPlay();
    $btnPlay.textContent = playing ? "❚❚ Pause" : "▶▶ Play";
    $btnPlay.disabled = phase === "done";
  }

  // ---------- play ----------
  function startPlay() {
    if (phase === "done") return;
    playing = true;
    renderButtons();
    playTimer = setInterval(function () {
      if (phase === "done") { stopPlay(); return; }
      step();
    }, PLAY_INTERVAL_MS);
  }
  function stopPlay() {
    playing = false;
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
    renderButtons();
  }

  // ---------- wire up ----------
  $btnNext.addEventListener("click", function () { stopPlay(); step(); });
  $btnPrev.addEventListener("click", function () { stopPlay(); previous(); });
  $btnPlay.addEventListener("click", function () {
    if (playing) stopPlay(); else startPlay();
  });
  $newPoints.addEventListener("click", function () { reset({ points: true }); });
  $newCentroids.addEventListener("click", function () { reset({ centroids: true }); });
  $numClusters.addEventListener("change", function () { reset({ points: true }); });
  $numCentroids.addEventListener("change", function () { reset({ centroids: true }); });

  // ---------- init ----------
  generatePoints();
  generateCentroids();
  reset({});
})();
