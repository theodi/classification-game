/* Guided play tours: tree basics, explore data, test & evaluate */
var GUIDE_FADE_MS = 320;
var GUIDE_GAP_MS = 180;
var GUIDE_OVERLAY_PREF_KEY = 'guideOverlayVisible';
var guideTimer = null;
var guideActive = false;
var guideIndex = -1;
var guideSteps = [];
var guideSnapshot = null;
var guideTourId = null;
var guideOverlayPreferred = true;

function readGuideOverlayPreferred() {
	try {
		var raw = window.localStorage.getItem(GUIDE_OVERLAY_PREF_KEY);
		if (raw === '0' || raw === 'false') {
			return false;
		}
		if (raw === '1' || raw === 'true') {
			return true;
		}
	} catch (err) {}
	return true;
}

function setGuideOverlayPreferred(visible) {
	guideOverlayPreferred = !!visible;
	try {
		window.localStorage.setItem(GUIDE_OVERLAY_PREF_KEY, guideOverlayPreferred ? '1' : '0');
	} catch (err) {}
	updateGuideOverlayToggle();
	updateGuideNavVisibility();
}

function updateGuideOverlayToggle() {
	var btn = document.querySelector('[data-guide-overlay-toggle]');
	if (!btn) {
		return;
	}
	var show = guideActive || guideOverlayPreferred;
	btn.textContent = guideOverlayPreferred ? 'Hide tutorials' : 'Show tutorials';
	btn.setAttribute('aria-pressed', guideOverlayPreferred ? 'true' : 'false');
}

var GUIDE_DEMO_TREE = {
	factors: { _: 'beds' },
	boundaries: { a: '1' },
	predictions: {
		l: { prediction: 'New York' },
		r: { prediction: 'San Francisco' }
	}
};

var GUIDE_BLANK_TREE = {
	factors: {},
	boundaries: {},
	predictions: {}
};

var GUIDE_DEMO_FEATURE = 'beds';
var GUIDE_DEMO_THRESHOLD = '1';
var GUIDE_DEMO_CITIES = {
	l: 'New York',
	r: 'San Francisco'
};

function getTourFlags() {
	try {
		var store = (typeof storage === 'object' && storage) ? storage : {};
		if ((!store.tours) && window.localStorage && typeof sessionId !== 'undefined' && sessionId) {
			store = JSON.parse(window.localStorage.getItem(sessionId) || '{}');
		}
		return Object.assign({
			treeBasicsDone: false,
			exploreDataDone: false,
			testEvaluateDone: false
		}, (store && store.tours) || {});
	} catch (err) {
		return { treeBasicsDone: false, exploreDataDone: false, testEvaluateDone: false };
	}
}

function setTourFlag(key, value) {
	try {
		if (typeof storage !== 'object' || !storage) {
			storage = {};
		}
		if (window.localStorage && typeof sessionId !== 'undefined' && sessionId && window.localStorage.getItem(sessionId)) {
			storage = JSON.parse(window.localStorage.getItem(sessionId) || '{}');
		}
		if (!storage.tours) {
			storage.tours = {};
		}
		storage.tours[key] = !!value;
		window.localStorage.setItem(sessionId, JSON.stringify(storage));
	} catch (err) {}
}

function clearGuideHover() {
	document.querySelectorAll('.is-guide-hover').forEach(function(el) {
		el.classList.remove('is-guide-hover');
	});
}

function getBrowseFrameWin() {
	var frame = document.getElementById('cluster-browse-frame');
	try {
		return frame && frame.contentWindow ? frame.contentWindow : null;
	} catch (err) {
		return null;
	}
}

function ensureBrowseGuideStyles(win) {
	if (!win || !win.document || !win.document.head) {
		return;
	}
	if (win.document.getElementById('guide-pulse-style')) {
		return;
	}
	var style = win.document.createElement('style');
	style.id = 'guide-pulse-style';
	/* Do not force position:relative — that breaks absolutely positioned chart axis controls. */
	style.textContent =
		'.is-guide-pulse{outline:2px solid #d32f2f!important;outline-offset:2px;' +
		'box-shadow:0 0 0 3px rgba(211,47,47,.28);animation:guide-pulse 1.1s ease-in-out infinite;z-index:5}' +
		'.chart-axis-control.is-guide-pulse{outline-offset:3px}' +
		'@keyframes guide-pulse{0%,100%{box-shadow:0 0 0 2px rgba(211,47,47,.2)}50%{box-shadow:0 0 0 6px rgba(211,47,47,.45)}}';
	win.document.head.appendChild(style);
}

function clearBrowseFramePulses() {
	var win = getBrowseFrameWin();
	if (!win || !win.document) {
		return;
	}
	try {
		win.document.querySelectorAll('.is-guide-pulse').forEach(function(el) {
			el.classList.remove('is-guide-pulse');
		});
	} catch (err) {}
}

function pulseBrowseFrameSelectors(selectors) {
	var win = getBrowseFrameWin();
	if (!win || !win.document) {
		return;
	}
	ensureBrowseGuideStyles(win);
	clearBrowseFramePulses();
	(selectors || []).forEach(function(sel) {
		try {
			win.document.querySelectorAll(sel).forEach(function(el) {
				el.classList.add('is-guide-pulse');
			});
		} catch (err) {}
	});
}

function whenBrowseFrameReady(done, tries) {
	tries = tries || 0;
	var win = getBrowseFrameWin();
	if (win && typeof win.showEmbedTab === 'function' && win.document.getElementById('browse-cards')) {
		ensureBrowseGuideStyles(win);
		done(win);
		return;
	}
	if (tries > 50) {
		done(null);
		return;
	}
	setTimeout(function() {
		whenBrowseFrameReady(done, tries + 1);
	}, 120);
}

function clearGuidePulses() {
	clearGuideHover();
	clearBrowseFramePulses();
	document.querySelectorAll('.is-guide-pulse').forEach(function(el) {
		el.classList.remove('is-guide-pulse');
	});
}

function openBrowseDownloadMenu() {
	var toggle = document.querySelector('[data-browse-download-toggle]');
	var menu = document.querySelector('.cluster-browse-download-menu');
	if (typeof syncBrowseDownloads === 'function') {
		syncBrowseDownloads();
	}
	if (menu) {
		menu.removeAttribute('hidden');
	}
	if (toggle) {
		toggle.setAttribute('aria-expanded', 'true');
	}
}

function closeBrowseDownloadMenu() {
	document.querySelectorAll('.cluster-browse-download-menu').forEach(function(menu) {
		menu.setAttribute('hidden', '');
	});
	document.querySelectorAll('[data-browse-download-toggle]').forEach(function(btn) {
		btn.setAttribute('aria-expanded', 'false');
	});
}

function demoRearrangeBrowseCards(done) {
	whenBrowseFrameReady(function(win) {
		if (!win) {
			if (typeof done === 'function') done();
			return;
		}
		var host = win.document.getElementById('browse-cards');
		if (!host || host.children.length < 2) {
			if (typeof done === 'function') done();
			return;
		}
		var first = host.children[0];
		var second = host.children[1];
		pulseBrowseFrameSelectors(['#browse-cards card']);
		first.classList.add('is-guide-pulse');
		second.classList.add('is-guide-pulse');
		setTimeout(function() {
			if (!guideActive) {
				return;
			}
			host.insertBefore(second, first);
			if (typeof done === 'function') done();
		}, 900);
	});
}

function browseTableBedsColumnIndex(win) {
	var features = (win && win.GAME_FEATURES) || [];
	var bedsIdx = -1;
	for (var i = 0; i < features.length; i++) {
		if (features[i].column === 'beds') {
			bedsIdx = i;
			break;
		}
	}
	return bedsIdx >= 0 ? bedsIdx + 1 : 4;
}

function demoHighlightTableHeaders(done) {
	whenBrowseFrameReady(function(win) {
		pulseBrowseFrameSelectors(['#cardsTable thead th']);
		if (typeof done === 'function') {
			setTimeout(done, 300);
		}
	});
}

function demoSortBrowseTableByBeds(done) {
	whenBrowseFrameReady(function(win) {
		if (!win || !win.$) {
			if (typeof done === 'function') done();
			return;
		}
		var col = browseTableBedsColumnIndex(win);
		var thSel = '#cardsTable thead th:nth-child(' + (col + 1) + ')';
		pulseBrowseFrameSelectors([thSel]);
		setTimeout(function() {
			if (!guideActive) {
				return;
			}
			try {
				var dt = win.$('#cardsTable').DataTable();
				dt.order([col, 'asc']).draw();
			} catch (err) {}
			pulseBrowseFrameSelectors([thSel]);
			if (typeof done === 'function') {
				setTimeout(done, 900);
			}
		}, 1500);
	});
}

function demoBrowseBoxplotBeds(done) {
	whenBrowseFrameReady(function(win) {
		if (!win) {
			if (typeof done === 'function') done();
			return;
		}
		var doc = win.document;
		var boxBtn = doc.querySelector('[data-chart-type="boxplot"]');
		if (boxBtn) {
			boxBtn.click();
		}
		// chartOptions is a module-level const (not on window) — change the real Y select.
		setTimeout(function() {
			if (!guideActive) {
				return;
			}
			var ySelect = doc.getElementById('yAxis');
			if (ySelect) {
				ySelect.value = 'beds';
				ySelect.dispatchEvent(new Event('change', { bubbles: true }));
			}
			requestAnimationFrame(function() {
				if (typeof win.resizeEmbedChart === 'function') {
					win.resizeEmbedChart();
				}
				pulseBrowseFrameSelectors([
					'[data-chart-type="boxplot"]',
					'#yAxis'
				]);
				if (typeof done === 'function') {
					setTimeout(done, 500);
				}
			});
		}, 350);
	});
}

function showLeafBranchHover(path) {
	clearGuideHover();
	var leaf = document.querySelector('#game-decision-tree .flow-leaf[data-path="' + (path || 'l') + '"]');
	var slot = leaf && leaf.querySelector('.game-leaf-slot');
	if (slot) {
		slot.classList.add('is-guide-hover');
	}
}

function showDeckBrowseHover() {
	clearGuideHover();
	var area = document.querySelector('.game-deck-stack-area');
	if (area) {
		area.classList.add('is-guide-hover');
	}
}

function positionGuideBelowCloseButton() {
	var floatEl = document.getElementById('game-guide-float');
	var closeBtn = document.querySelector('#cluster-browse-modal [data-cluster-browse-close]');
	if (!floatEl || !closeBtn) {
		return;
	}
	var closeRect = closeBtn.getBoundingClientRect();
	// Leave room under Close for the Download dropdown (CSV + PDF).
	var gapBelowClose = 118;
	var top = closeRect.bottom + gapBelowClose;
	var right = Math.max(12, window.innerWidth - closeRect.right);
	var maxTop = Math.max(12, window.innerHeight - floatEl.offsetHeight - 12);
	floatEl.style.top = Math.min(top, maxTop) + 'px';
	floatEl.style.right = right + 'px';
	floatEl.style.left = 'auto';
}

function setGuideFloatOverModal(overModal) {
	var floatEl = document.getElementById('game-guide-float');
	var modal = document.getElementById('cluster-browse-modal');
	var workspace = document.getElementById('game-workspace');
	if (!floatEl) {
		return;
	}
	if (overModal && modal) {
		if (!floatEl._guideHome) {
			floatEl._guideHome = floatEl.parentNode;
		}
		if (floatEl.parentNode !== modal) {
			modal.appendChild(floatEl);
		}
		floatEl.classList.add('is-over-modal');
		positionGuideBelowCloseButton();
		return;
	}
	var home = floatEl._guideHome || workspace;
	if (home && floatEl.parentNode !== home) {
		home.appendChild(floatEl);
	}
	floatEl.classList.remove('is-over-modal');
	floatEl.style.top = '';
	floatEl.style.right = '';
	floatEl.style.left = '';
	floatEl._guideHome = null;
}

function prepareExploreWorkspace() {
	if (typeof returnCardsInstant === 'function' && typeof cards !== 'undefined' && cards.trainingSet) {
		returnCardsInstant(cards.trainingSet, 'training-set', 'b');
	}
	if (typeof hideRunSummaryPanel === 'function') {
		hideRunSummaryPanel();
	}
	if (typeof modelHasRun !== 'undefined') {
		modelHasRun = false;
	}
}

function pulseGuideSelectors(selectors) {
	clearGuidePulses();
	(selectors || []).forEach(function(sel) {
		try {
			document.querySelectorAll(sel).forEach(function(el) {
				el.classList.add('is-guide-pulse');
			});
		} catch (err) {}
	});
}

function stopGuideTimer() {
	if (guideTimer) {
		clearTimeout(guideTimer);
		guideTimer = null;
	}
}

function setGuideMessage(text, done) {
	var msg = document.getElementById('game-guide-message');
	if (!msg) {
		if (typeof done === 'function') done();
		return;
	}
	var show = function() {
		msg.textContent = text || '';
		void msg.offsetWidth;
		msg.classList.remove('is-faded');
		if (typeof done === 'function') {
			setTimeout(done, GUIDE_FADE_MS);
		}
	};
	if (!msg.textContent || msg.classList.contains('is-faded')) {
		show();
		return;
	}
	msg.classList.add('is-faded');
	setTimeout(show, GUIDE_FADE_MS + GUIDE_GAP_MS);
}

function setGuideChromeVisible(visible) {
	var flow = document.getElementById('game-guide-flow');
	var guideNav = document.getElementById('game-guide-nav');
	var floatEl = document.getElementById('game-guide-float');
	if (flow) {
		flow.classList.toggle('hidden', !visible);
	}
	if (guideNav) {
		guideNav.classList.toggle('is-guide-running', !!visible);
	}
	if (floatEl) {
		floatEl.classList.toggle('is-running', !!visible);
	}
	updateGuideNavVisibility();
}

function updateGuideNavVisibility() {
	var guideNav = document.getElementById('game-guide-nav');
	var floatEl = document.getElementById('game-guide-float');
	var inTraining = typeof currentPlayMode === 'undefined' || currentPlayMode === 'training' ||
		(guideActive && currentPlayMode === 'test');
	var wantOverlay = guideActive || guideOverlayPreferred;
	if (floatEl) {
		floatEl.classList.toggle('is-visible', !!inTraining && wantOverlay);
	}
	if (guideNav) {
		guideNav.classList.toggle('hidden', !inTraining || guideActive || !guideOverlayPreferred);
	}
	updateGuideOverlayToggle();
}

function snapshotPlayState() {
	var summary = document.getElementById('game-run-summary');
	var tree = null;
	try {
		if (typeof liveGameTree === 'function') {
			tree = JSON.parse(JSON.stringify(liveGameTree()));
		}
	} catch (err) {
		tree = typeof liveGameTree === 'function' ? liveGameTree() : null;
	}
	var summaryState = null;
	try {
		if (typeof runSummaryState !== 'undefined') {
			summaryState = JSON.parse(JSON.stringify(runSummaryState));
		}
	} catch (err2) {
		summaryState = typeof runSummaryState !== 'undefined' ? runSummaryState : null;
	}
	return {
		playMode: typeof currentPlayMode !== 'undefined' ? currentPlayMode : 'training',
		tree: tree,
		modelHasRun: typeof modelHasRun !== 'undefined' ? !!modelHasRun : false,
		confidences: typeof confidences !== 'undefined' ? Object.assign({}, confidences) : {},
		summaryVisible: !!(summary && !summary.classList.contains('hidden')),
		runSummaryState: summaryState
	};
}

function applyGameTreeSnapshot(tree) {
	if (!tree) {
		return;
	}
	if (window.gameTree && typeof window.gameTree.fromGameTree === 'function') {
		window.gameTree.fromGameTree(tree);
	}
	if (typeof predictions !== 'undefined') {
		predictions = Object.assign({}, tree.predictions || {});
	}
	if (typeof saveData === 'function') {
		saveData();
	}
}

function restorePlayState(snap) {
	if (!snap) {
		return;
	}
	if (typeof closeClusterBrowse === 'function') {
		closeClusterBrowse();
	}
	clearGuidePulses();
	if (typeof clearNonEvaluationCardsFromTree === 'function') {
		clearNonEvaluationCardsFromTree();
	} else if (typeof returnCardsInstant === 'function' && typeof cards !== 'undefined' && cards.trainingSet) {
		returnCardsInstant(cards.trainingSet, 'training-set', 'b');
	}
	if (typeof cards !== 'undefined' && cards.testSet && typeof clearRendered === 'function') {
		clearRendered(cards.testSet, 'p');
		cards.testSet = [];
	}
	if (typeof modelHasRun !== 'undefined') {
		modelHasRun = false;
	}
	if (typeof setPlayMode === 'function') {
		setPlayMode('training', {
			force: true,
			keepSummary: !!snap.summaryVisible,
			fromGuideRestore: true
		});
	}
	applyGameTreeSnapshot(snap.tree);
	if (typeof modelHasRun !== 'undefined') {
		modelHasRun = !!snap.modelHasRun;
	}
	if (typeof confidences !== 'undefined' && snap.confidences) {
		confidences = Object.assign({}, confidences, snap.confidences);
	}
	if (typeof runSummaryState !== 'undefined' && snap.runSummaryState) {
		runSummaryState = snap.runSummaryState;
	}
	if (snap.summaryVisible && typeof refreshRunSummaryPanel === 'function') {
		refreshRunSummaryPanel();
	} else if (typeof hideRunSummaryPanel === 'function') {
		hideRunSummaryPanel();
	}
	if (snap.modelHasRun && typeof restoreCardsToBoxes === 'function' && typeof cards !== 'undefined' && cards.trainingSet) {
		restoreCardsToBoxes(cards.trainingSet);
	} else if (typeof returnCardsInstant === 'function' && typeof cards !== 'undefined' && cards.trainingSet) {
		returnCardsInstant(cards.trainingSet, 'training-set', 'b');
	}
}

function prepareDemoWorkspace() {
	if (typeof modelHasRun !== 'undefined') {
		modelHasRun = false;
	}
	if (typeof returnCardsInstant === 'function' && typeof cards !== 'undefined' && cards.trainingSet) {
		returnCardsInstant(cards.trainingSet, 'training-set', 'b');
	}
	if (typeof hideRunSummaryPanel === 'function') {
		hideRunSummaryPanel();
	}
}

function applyBlankDemoTree() {
	prepareDemoWorkspace();
	applyGameTreeSnapshot(GUIDE_BLANK_TREE);
}

function applyDemoTree() {
	prepareDemoWorkspace();
	applyGameTreeSnapshot(GUIDE_DEMO_TREE);
}

function setRootFeature(feature) {
	var select = document.querySelector('#game-decision-tree [data-tree-feature][data-path=""]');
	if (!select) {
		return;
	}
	select.focus();
	select.value = feature;
	select.dispatchEvent(new Event('change', { bubbles: true }));
}

function typeRootThreshold(value, done) {
	var input = document.querySelector('#game-decision-tree [data-tree-threshold][data-path=""]:not([disabled])');
	if (!input) {
		if (typeof done === 'function') done();
		return;
	}
	input.focus();
	input.value = '';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	var text = String(value);
	var index = 0;
	function typeNext() {
		if (!guideActive) {
			return;
		}
		if (index >= text.length) {
			input.dispatchEvent(new Event('change', { bubbles: true }));
			if (typeof done === 'function') done();
			return;
		}
		input.value += text.charAt(index);
		index += 1;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		setTimeout(typeNext, 320);
	}
	setTimeout(typeNext, 280);
}

function setLeafCities(cityMap, done) {
	Object.keys(cityMap || {}).forEach(function(path) {
		var select = document.querySelector('#game-decision-tree [data-tree-city][data-path="' + path + '"]');
		if (!select) {
			return;
		}
		select.value = cityMap[path];
		select.dispatchEvent(new Event('change', { bubbles: true }));
	});
	if (typeof done === 'function') {
		setTimeout(done, 350);
	}
}

function runDemoTrainingSort(done) {
	if (typeof cards === 'undefined' || !cards.trainingSet || typeof sortCards !== 'function') {
		if (typeof done === 'function') done();
		return;
	}
	if (typeof returnCardsInstant === 'function') {
		returnCardsInstant(cards.trainingSet, 'training-set', 'b');
	}
	sortCards(cards.trainingSet, 'b', null, function() {
		if (typeof done === 'function') done();
	});
}

function getTreeBasicsSteps() {
	return [
		{
			message: 'Welcome. Your goal is to build a decision tree that can predict whether an unseen property is in New York or San Francisco.',
			ms: 6000
		},
		{
			message: 'We start from a blank tree. Click the feature box to choose what to split on.',
			pulse: ['#game-decision-tree .flow-decision[data-path=""]', '[data-tree-feature][data-path=""]'],
			fill: function() {
				applyBlankDemoTree();
			},
			ms: 5500
		},
		{
			message: 'Selecting Bedrooms…',
			pulse: ['[data-tree-feature][data-path=""]', '[data-tree-open-feature]'],
			async: true,
			fill: function(done) {
				setRootFeature(GUIDE_DEMO_FEATURE);
				setTimeout(done, 700);
			},
			ms: 3500
		},
		{
			message: 'Now type a threshold. Cards with that value or less go left (≤); the rest go right (>).',
			pulse: [
				'.flow-decision[data-path=""] .flow-edge-threshold',
				'.flow-decision[data-path=""] [data-tree-threshold]',
				'.flow-decision[data-path=""] .flow-threshold-mirror'
			],
			async: true,
			fill: function(done) {
				typeRootThreshold(GUIDE_DEMO_THRESHOLD, done);
			},
			ms: 4500
		},
		{
			message: 'Your training cards live in this box. They are the examples you use to build and check your tree.',
			pulse: ['.game-deck-chrome', '#training-set'],
			ms: 5500
		},
		{
			message: 'When you are ready, press Run model. Each card travels down the tree into a leaf box.',
			pulse: ['#play-primary-action'],
			ms: 5000
		},
		{
			message: 'Running the model on the training cards…',
			pulse: ['#play-primary-action', '#training-set'],
			async: true,
			fill: function(done) {
				runDemoTrainingSort(done);
			},
			ms: 4000
		},
		{
			message: 'After the cards land, each leaf prediction is set automatically to the majority city in that box. You can change it manually after any run.',
			pulse: ['.flow-leaf-card', '.flow-city-row--full', '.flow-city-display'],
			ms: 6500
		},
		{
			message: 'This overall percentage is how many training cards your tree classified correctly — for example about 80% means four in five cards matched.',
			pulse: ['#game-run-summary-scores', '.game-run-score'],
			ms: 6500
		},
		{
			message: 'The table breaks that down by branch: for each leaf, how many cards matched its prediction. Hover a row to spotlight that leaf on the tree.',
			pulse: ['#game-run-summary-body', '.game-run-stats'],
			ms: 6500
		},
		{
			message: 'Want a finer split? Hover a leaf and choose Add branch. You can go up to three levels deep.',
			pulse: [
				'.flow-leaf[data-path="l"] .game-leaf-slot',
				'.flow-leaf[data-path="l"] [data-tree-action="branch"]'
			],
			fill: function() {
				showLeafBranchHover('l');
			},
			ms: 6500
		},
		{
			message: 'Once your tree looks good, trying testing it before submitting it for evaluation to get your score.',
			pulse: ['[data-run-test]', '[data-enter-evaluation]'],
			fill: function() {
				clearGuideHover();
			},
			ms: 6000
		},
		{
			message: 'That is the core loop: choose a feature, type a threshold, Run model, refine with branches, then test and evaluate.',
			ms: 5000
		}
	];
}

function getExploreDataSteps() {
	return [
		{
			message: 'You can explore the training cards without changing your tree.',
			pulse: [],
			fill: function() {
				prepareExploreWorkspace();
			},
			ms: 5000
		},
		{
			message: 'Hover over a card deck to reveal Browse cards (either in the tree or in the run model box).',
			pulse: ['.game-deck-stack-area', '[data-browse-all-cards]', '#training-set'],
			fill: function() {
				showDeckBrowseHover();
			},
			ms: 5000
		},
		{
			message: 'Cards view shows each property as a card. You can rearrange them by clicking and dragging.',
			pulse: ['[data-browse-tab="browse-cards"]'],
			async: true,
			fill: function(done) {
				clearGuideHover();
				if (typeof browseAllCards === 'function') {
					browseAllCards();
				}
				setGuideFloatOverModal(true);
				whenBrowseFrameReady(function() {
					demoRearrangeBrowseCards(done);
				});
			},
			ms: 5500
		},
		{
			message: 'Table view lists every feature. Click a column header to re-order the rows.',
			pulse: ['[data-browse-tab="table"]'],
			async: true,
			fill: function(done) {
				setGuideFloatOverModal(true);
				if (typeof setBrowseModalTab === 'function') {
					setBrowseModalTab('table');
				}
				setTimeout(function() {
					demoHighlightTableHeaders(done);
				}, 400);
			},
			ms: 5500
		},
		{
			message: 'Here we order by Bedrooms — watch the rows rearrange.',
			pulse: ['[data-browse-tab="table"]'],
			async: true,
			fill: function(done) {
				setGuideFloatOverModal(true);
				demoSortBrowseTableByBeds(done);
			},
			ms: 6500
		},
		{
			message: 'Chart view helps you spot patterns. Click a chart type, then use the bordered axis boxes to choose what is plotted.',
			pulse: ['[data-browse-tab="charts"]'],
			async: true,
			fill: function(done) {
				setGuideFloatOverModal(true);
				if (typeof setBrowseModalTab === 'function') {
					setBrowseModalTab('charts');
				}
				setTimeout(function() {
					whenBrowseFrameReady(function(win) {
						if (win && typeof win.resizeEmbedChart === 'function') {
							win.resizeEmbedChart();
						}
						pulseBrowseFrameSelectors([
							'.chart-button',
							'#xAxis',
							'#yAxis',
							'.chart-axis-fixed'
						]);
						done();
					});
				}, 500);
			},
			ms: 5500
		},
		{
			message: 'Here is a box plot of Bedrooms by city — useful for comparing how the two cities differ on one feature.',
			pulse: ['[data-browse-tab="charts"]'],
			async: true,
			fill: function(done) {
				setGuideFloatOverModal(true);
				demoBrowseBoxplotBeds(done);
			},
			ms: 6500
		},
		{
			message: 'Need the data offline? Use Download for CSV or PDF.',
			pulse: ['[data-browse-download-toggle]', '.cluster-browse-download', '#browse-download-csv', '#browse-download-pdf'],
			fill: function() {
				setGuideFloatOverModal(true);
				openBrowseDownloadMenu();
				positionGuideBelowCloseButton();
			},
			ms: 5500
		},
		{
			message: 'Close when you are done.',
			pulse: ['[data-cluster-browse-close]'],
			fill: function() {
				closeBrowseDownloadMenu();
				if (typeof closeClusterBrowse === 'function') {
					closeClusterBrowse();
				}
				setGuideFloatOverModal(false);
				showLeafBranchHover('l');
			},
			ms: 6000
		}
	];
}

function getTestEvaluateSteps() {
	return [
		{
			message: 'Once your tree looks good on training cards, check it on test cards, then evaluate for a scored attempt.',
			ms: 5500
		},
		{
			message: 'We will use a simple Bedrooms tree and run it on the training set first.',
			pulse: ['#game-decision-tree'],
			fill: function() {
				applyDemoTree();
			},
			ms: 4500
		},
		{
			message: 'Running on training cards to open the summary…',
			async: true,
			fill: function(done) {
				runDemoTrainingSort(done);
			},
			ms: 4000
		},
		{
			message: 'The summary shows how well leaves matched. Next: Run a test?',
			pulse: ['#game-run-summary', '[data-run-test]'],
			ms: 6000
		},
		{
			message: 'Dealing a test set and sorting it through your tree. This is the first time the test cards have seen your tree.',
			pulse: ['[data-run-test]', '#test-set'],
			async: true,
			fill: function(done) {
				if (typeof setPlayMode === 'function') {
					setPlayMode('test', { force: true, fromGuide: true, keepSummary: true });
				}
				if (typeof reshuffleAndDealTestSet === 'function') {
					reshuffleAndDealTestSet(20);
				}
				window.setTimeout(function() {
					if (typeof sortCards === 'function' && typeof cards !== 'undefined' && cards.testSet) {
						sortCards(cards.testSet, 'p', null, done);
					} else if (typeof done === 'function') {
						done();
					}
				}, 550);
			},
			ms: 4500
		},
		{
			message: 'Compare training and test detail in the summary that you can compare with the training set.',
			pulse: ['[data-summary-view="training"]', '[data-summary-view="test"]', '#game-run-summary'],
			fill: function() {
				if (typeof runSummaryState !== 'undefined') {
					runSummaryState.view = 'test';
				}
				if (typeof refreshRunSummaryPanel === 'function') {
					refreshRunSummaryPanel();
				}
			},
			ms: 6500
		},
		{
			message: 'When you are ready for a scored attempt, use Submit your tree and evaluate. That opens the evaluation tutorial and leaderboard path — we will not submit from this tour.',
			pulse: ['[data-enter-evaluation]'],
			fill: function() {
				if (typeof setPlayMode === 'function') {
					setPlayMode('training', { force: true, fromGuide: true, keepSummary: true });
				}
				if (typeof refreshRunSummaryPanel === 'function') {
					refreshRunSummaryPanel();
				}
			},
			ms: 7000
		}
	];
}

function getGuideStepsForTour(tourId) {
	if (tourId === 'treeBasics') return getTreeBasicsSteps();
	if (tourId === 'exploreData') return getExploreDataSteps();
	if (tourId === 'testEvaluate') return getTestEvaluateSteps();
	return [];
}

function tourFlagKey(tourId) {
	if (tourId === 'treeBasics') return 'treeBasicsDone';
	if (tourId === 'exploreData') return 'exploreDataDone';
	if (tourId === 'testEvaluate') return 'testEvaluateDone';
	return tourId + 'Done';
}

function completeGuidedTour() {
	stopGuideTimer();
	guideActive = false;
	guideIndex = -1;
	guideSteps = [];
	var tourId = guideTourId;
	guideTourId = null;
	var snap = guideSnapshot;
	guideSnapshot = null;
	setGuideChromeVisible(false);
	var msg = document.getElementById('game-guide-message');
	if (msg) {
		msg.textContent = '';
		msg.classList.add('is-faded');
	}
	clearGuidePulses();
	closeBrowseDownloadMenu();
	setGuideFloatOverModal(false);
	if (typeof closeClusterBrowse === 'function') {
		closeClusterBrowse();
	}
	restorePlayState(snap);
	if (tourId) {
		setTourFlag(tourFlagKey(tourId), true);
	}
	updateGuideNavVisibility();
}

function skipGuidedTour() {
	if (!guideActive) {
		return;
	}
	completeGuidedTour();
}

function runGuideStep() {
	if (!guideActive) {
		return;
	}
	if (guideIndex >= guideSteps.length) {
		completeGuidedTour();
		return;
	}
	var step = guideSteps[guideIndex];
	guideIndex += 1;
	setGuideMessage(step.message || '', function() {
		if (!guideActive) {
			return;
		}
		pulseGuideSelectors(step.pulse || []);
		var advance = function() {
			if (!guideActive) {
				return;
			}
			stopGuideTimer();
			guideTimer = setTimeout(runGuideStep, step.ms || 4500);
		};
		if (typeof step.fill === 'function') {
			if (step.async) {
				step.fill(advance);
			} else {
				step.fill();
				advance();
			}
		} else {
			advance();
		}
	});
}

function startGuidedTour(tourId) {
	if (guideActive) {
		skipGuidedTour();
	}
	if (typeof currentPlayMode !== 'undefined' && currentPlayMode === 'evaluation' &&
		typeof evalFlowPhase !== 'undefined' && evalFlowPhase === 'tutorial') {
		return;
	}
	var steps = getGuideStepsForTour(tourId);
	if (!steps.length) {
		return;
	}
	if (typeof setPlayMode === 'function' && currentPlayMode !== 'training') {
		setPlayMode('training', { force: true, fromGuide: true });
	}
	guideSnapshot = snapshotPlayState();
	guideTourId = tourId;
	guideSteps = steps;
	guideIndex = 0;
	guideActive = true;
	stopGuideTimer();
	if (tourId === 'treeBasics') {
		applyBlankDemoTree();
	}
	if (tourId === 'exploreData') {
		prepareExploreWorkspace();
	}
	if (!guideOverlayPreferred) {
		setGuideOverlayPreferred(true);
	}
	setGuideFloatOverModal(false);
	setGuideChromeVisible(true);
	var msg = document.getElementById('game-guide-message');
	if (msg) {
		msg.textContent = '';
		msg.classList.add('is-faded');
	}
	runGuideStep();
}

function maybeAutoStartTreeBasicsTour() {
	if (typeof entryMode !== 'undefined' && entryMode) {
		return;
	}
	if (typeof replayOnly !== 'undefined' && replayOnly) {
		return;
	}
	if (typeof resultId !== 'undefined' && resultId) {
		return;
	}
	var flags = getTourFlags();
	if (flags.treeBasicsDone) {
		return;
	}
	if (typeof currentPlayMode !== 'undefined' && currentPlayMode !== 'training') {
		return;
	}
	startGuidedTour('treeBasics');
}

document.addEventListener('click', function(event) {
	if (event.target.closest('[data-guide-skip]')) {
		if (event.preventDefault) event.preventDefault();
		skipGuidedTour();
		return;
	}
	var overlayToggle = event.target.closest('[data-guide-overlay-toggle]');
	if (overlayToggle) {
		if (event.preventDefault) event.preventDefault();
		if (guideActive && guideOverlayPreferred) {
			skipGuidedTour();
		}
		setGuideOverlayPreferred(!guideOverlayPreferred);
		return;
	}
	var tourBtn = event.target.closest('[data-guide-tour]');
	if (tourBtn) {
		if (event.preventDefault) event.preventDefault();
		startGuidedTour(tourBtn.getAttribute('data-guide-tour'));
	}
});

guideOverlayPreferred = readGuideOverlayPreferred();
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', function() {
		updateGuideOverlayToggle();
		updateGuideNavVisibility();
	});
} else {
	updateGuideOverlayToggle();
	updateGuideNavVisibility();
}

window.startGuidedTour = startGuidedTour;
window.skipGuidedTour = skipGuidedTour;
window.maybeAutoStartTreeBasicsTour = maybeAutoStartTreeBasicsTour;
window.updateGuideNavVisibility = updateGuideNavVisibility;
window.setGuideOverlayPreferred = setGuideOverlayPreferred;
window.guideTourActive = function() { return guideActive; };
