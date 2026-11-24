var cards = [];
cards.trainingSet = [];
cards.testSet = [];
cards.evaluationSet = [];

var rCount = 0;
var rDone = [];
var pCount = 0;
var pDone = [];
var maxCount = 20;
var predictions = {};
var confidences = {};
var results = {};
results.vsMachine = { win: 0, draw: 0, lost: 0 };
results.vsHybrid = { win: 0, draw: 0, lost: 0 };
confidences.player = false;
var modelHasRun = false;

var GAME_FEATURES = [];
var OPPONENTS = null;
var EVAL_SETS = null;
var EVAL_POOL = [];

function boxCityCounts(box, cardset) {
    var counts = { 'New York': 0, 'San Francisco': 0 };
    var set = cardset || (typeof cards !== 'undefined' ? cards.trainingSet : []) || [];
    set.forEach(function(card) {
        if (card.box === box && counts[card.city] !== undefined) {
            counts[card.city] += 1;
        }
    });
    return counts;
}

function majorityCityFromCounts(counts) {
    if (!counts) {
        return '';
    }
    if (counts['New York'] > counts['San Francisco']) {
        return 'New York';
    }
    if (counts['San Francisco'] > counts['New York']) {
        return 'San Francisco';
    }
    if (counts['New York'] === 0 && counts['San Francisco'] === 0) {
        return '';
    }
    return '?';
}

function majorityCityForBox(box, cardset) {
    if (cardset) {
        assignBoxes(cardset);
    } else if (typeof cards !== 'undefined' && cards.trainingSet) {
        assignBoxes(cards.trainingSet);
    }
    return majorityCityFromCounts(boxCityCounts(box, cardset));
}

function restoreCardsToBoxes(cardset) {
    var set = cardset || (typeof cards !== 'undefined' ? cards.trainingSet : []) || [];
    assignBoxes(set);
    set.forEach(function(card) {
        var el = document.getElementById('b' + card.index);
        var dest = document.getElementById('box_' + card.box);
        if (el && dest) {
            dest.appendChild(el);
        }
    });
    if (typeof refreshCardboxes === 'function') {
        refreshCardboxes();
    }
}

function loadGameData() {
    return Promise.all([
        fetch('/config/features.json').then(function(response) { return response.json(); }),
        fetch('/data/pack.json').then(function(response) { return response.json(); }),
        fetch('/data/opponents/group1.json').then(function(response) { return response.json(); }),
        fetch('/data/eval_sets.json').then(function(response) { return response.json(); }),
        fetch('/data/evaluation_pool.json').then(function(response) { return response.json(); })
    ]).then(function(loaded) {
        GAME_FEATURES = loaded[0].features;
        window.GAME_FEATURES = GAME_FEATURES;
        OPPONENTS = loaded[2];
        EVAL_SETS = loaded[3];
        EVAL_POOL = loaded[4].cards;
        fillFeatureSelects(GAME_FEATURES);
        if (typeof initChartFeatures === 'function') {
            initChartFeatures(GAME_FEATURES);
        }
        loadPack(loaded[1]);
        return loaded;
    });
}

function fillFeatureSelects(features) {
    document.querySelectorAll('select[id^="factor"]').forEach(function(select) {
        if (select.getAttribute('data-filled') === 'yes') {
            return;
        }
        var placeholder = select.querySelector('option');
        features.forEach(function(feature) {
            var option = document.createElement('option');
            option.value = feature.column;
            option.textContent = feature.label;
            select.appendChild(option);
        });
        select.setAttribute('data-filled', 'yes');
        if (placeholder) {
            placeholder.selected = true;
        }
    });
}

function formatNumber(num) {
    return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
}

function formatFeature(feature, value) {
    if (value === undefined || value === null || value === '') {
        return '';
    }
    var text = feature.format === 'integer' ? String(value) : formatNumber(value);
    return (feature.prefix || '') + text + (feature.suffix || '');
}

function featureRows(data, hidden) {
    return GAME_FEATURES.map(function(feature) {
        var value = hidden ? '?????' : formatFeature(feature, data[feature.column]);
        return '<tr><td class="attribute">' + feature.label + '</td><td class="value">' + value + '</td></tr>';
    }).join('');
}

function cardMarkup(data, count, color, type, idPrefix) {
    var cityOnly = type === 'test';
    var displayNum = (data.displayId != null && data.displayId !== '') ? data.displayId : count;
    var table = cityOnly
        ? ''
        : '<table class="' + color + '">' + featureRows(data, false) + '</table>';
    return '<card draggable="true" class="draggable drag-drop card-' + type +
        (cityOnly ? ' card-test--city-only' : '') +
        '" id="' + idPrefix + count + '">' +
        '<div class="card-head"><h1 class="target">' + data.city + '</h1><h1 class="number">#' + displayNum + '</h1></div>' +
        '<image src="/img/house.png"></image>' +
        table +
        '</card>';
}

function loadPack(pack) {
    cards.trainingSet = [];
    pack.cards.forEach(function(card) {
        card.index = card.id;
        cards.trainingSet.push(card);
        renderCard(card, card.index, 'blue', 'training');
    });
}

function renderCard(data, count, color, type) {
    $('#training-set').append(cardMarkup(data, count, color, type || 'training', 'b'));
}

function renderRedCard(data, count, color) {
    $('#evaluation-set').append(cardMarkup(data, count, color, 'evaluation', 'r'));
}

function renderPurpleCard(data, count, color) {
    // City visible; features omitted (holdout look without leaking attributes).
    $('#test-set').append(cardMarkup(data, count, color, 'test', 'p'));
}

function renderCards(cardList, type) {
    cardList.forEach(function(card) {
        renderCard(card, card.index, 'blue', type);
    });
}

function clearTestSet() {
    if (cards.testSet && cards.testSet.length) {
        clearRendered(cards.testSet, 'p');
    }
    cards.testSet = [];
    pCount = 0;
    var deck = document.getElementById('test-set');
    if (deck) {
        deck.querySelectorAll('card').forEach(function(el) {
            el.remove();
        });
    }
}

function shufflePool(pool) {
    var list = pool.slice();
    var i = list.length;
    while (i > 0) {
        var swap = Math.floor(Math.random() * i);
        i -= 1;
        var held = list[i];
        list[i] = list[swap];
        list[swap] = held;
    }
    return list;
}

function getRandomPurples(count) {
    clearTestSet();
    var source = (EVAL_POOL && EVAL_POOL.length) ? EVAL_POOL : cards.trainingSet;
    var pool = shufflePool(source);
    var take = Math.min(count || 20, pool.length);
    pool.slice(0, take).forEach(function(card, index) {
        var copy = Object.assign({}, card, {
            index: index + 1,
            displayId: card.id != null ? String(card.id) : String(index + 1),
            city: actualCity(card)
        });
        cards.testSet.push(copy);
        renderPurpleCard(copy, copy.index, 'purple');
        pCount += 1;
    });
}

function dealTestSet() {
    var deck = document.getElementById('test-set');
    if (!deck) {
        return;
    }
    if (typeof returnCardsInstant === 'function' && cards.testSet && cards.testSet.length) {
        returnCardsInstant(cards.testSet, 'test-set', 'p');
    }
    deck.classList.remove('game-deck-dealing');
    void deck.offsetWidth;
    deck.classList.add('game-deck-dealing');
    var cardsInDeck = deck.querySelectorAll('card');
    cardsInDeck.forEach(function(card, index) {
        card.style.setProperty('--deal-i', String(index));
    });
    window.clearTimeout(dealTestSet._timer);
    dealTestSet._timer = window.setTimeout(function() {
        deck.classList.remove('game-deck-dealing');
    }, 1200 + cardsInDeck.length * 40);
}

function reshuffleAndDealTestSet(count) {
    getRandomPurples(count || 20);
    dealTestSet();
}

function copyEvalCard(card) {
    var copy = Object.assign({}, card);
    copy.index = card.id;
    copy.city = '?';
    return copy;
}

function cardsForRun(number) {
    if (typeof evalSetId !== 'undefined' && evalSetId && EVAL_SETS && EVAL_SETS[evalSetId]) {
        return EVAL_SETS[evalSetId].runs[number - 1].map(copyEvalCard);
    }
    var pool = EVAL_POOL.slice();
    var i = pool.length;
    while (i > 0) {
        var swap = Math.floor(Math.random() * i);
        i -= 1;
        var held = pool[i];
        pool[i] = pool[swap];
        pool[swap] = held;
    }
    return pool.slice(0, 20).map(copyEvalCard);
}

function clearRendered(cardset, color) {
    cardset.forEach(function(card) {
        $('#' + color + card.index).remove();
    });
    if (color === 'r') {
        rCount = 0;
        rDone = [];
        cards.evaluationSet = [];
    }
}

function removeCards(cardset, color) {
    clearRendered(cardset, color);
    return [];
}

function removeCard(id, cardset, color) {
    $('#' + color + id).remove();
    return cardset.filter(function(card) { return String(card.index) !== String(id); });
}

function moveAnimate(element, newParent) {
    element = $(element);
    newParent = $(newParent);
    if (!element.length || !newParent.length) {
        return;
    }
    var oldOffset = element.offset();
    element.appendTo(newParent);
    var newOffset = element.offset();
    var temp = element.clone().appendTo('body');
    temp.css({
        position: 'absolute',
        left: oldOffset.left,
        top: oldOffset.top,
        'z-index': 1000
    });
    element.hide();
    temp.animate({ top: newOffset.top, left: newOffset.left }, 'slow', function() {
        element.show();
        temp.remove();
    });
}

function animateCard(card, color) {
    moveAnimate('#' + color + card.index, '#box_' + card.box);
}

function returnCards(cardset, boxid, color) {
    var interval = 0;
    cardset.forEach(function(card) {
        $('#' + color + card.index).removeAttr('style');
        setTimeout(function() {
            moveAnimate('#' + color + card.index, '#' + boxid);
        }, interval);
        interval += 100;
    });
}

function returnCardsInstant(cardset, boxid, color) {
    var dest = document.getElementById(boxid);
    if (!dest) {
        return;
    }
    cardset.forEach(function(card) {
        var el = document.getElementById(color + card.index);
        if (el) {
            el.removeAttribute('style');
            dest.appendChild(el);
        }
    });
}

function currentTreeModel() {
    if (typeof liveGameTree === 'function') {
        return liveGameTree();
    }
    if (typeof TreeScore !== 'undefined' && window.gameTree) {
        return window.gameTree.toGameTree();
    }
    return { factors: {}, boundaries: {}, predictions: predictions || {} };
}

function sortCard(card, currentPosition) {
    if (currentPosition === '') {
        card.box = '';
    }
    var tree = currentTreeModel();
    var factorKey = currentPosition === '' ? '_' : currentPosition;
    var boundaryKey = currentPosition === '' ? 'a' : currentPosition + 'a';
    var factor = tree.factors && tree.factors[factorKey];
    var boundary = tree.boundaries && tree.boundaries[boundaryKey];
    if (!factor || boundary === '' || boundary === undefined || boundary === null) {
        return card;
    }
    if (parseFloat(card[factor]) <= parseFloat(boundary)) {
        currentPosition = currentPosition + 'l';
        card.box = card.box + 'l';
    } else {
        currentPosition = currentPosition + 'r';
        card.box = card.box + 'r';
    }
    if (currentPosition.length < 3) {
        return sortCard(card, currentPosition);
    }
    return card;
}

function assignBoxes(cardset) {
    cardset.forEach(function(card) {
        sortCard(card, '');
    });
}

function sortCards(cardset, color, number) {
    if ((color === 'p' || color === 'r') &&
        window.gameTree && typeof window.gameTree.showAllLeafCards === 'function') {
        window.gameTree.showAllLeafCards();
    }
    assignBoxes(cardset);
    var interval = 0;
    cardset.forEach(function(card) {
        $('#' + color + card.index).removeAttr('style');
        setTimeout(function() {
            animateCard(card, color);
        }, interval);
        interval += 200;
    });
    var settleMs = interval + 700;
    if (color === 'b') {
        // Wait until the last card finishes its flight; do not auto-end leaves.
        setTimeout(function() {
            modelHasRun = true;
            getPredictions(cardset, true, { applyToTree: false });
            if (typeof showTrainingRunSummary === 'function') {
                showTrainingRunSummary(cardset);
            }
        }, settleMs);
    } else if (color === 'p') {
        setTimeout(function() {
            if (typeof showTestRunSummary === 'function') {
                showTestRunSummary(cardset);
            }
        }, settleMs);
    }
}

function branchLabel(path) {
    if (!path) {
        return 'Root';
    }
    return path.split('').map(function(side) {
        return side === 'l' ? 'L' : 'R';
    }).join('') || 'Root';
}

function leafMatchStats(cardset) {
    assignBoxes(cardset || []);
    var byBox = {};
    (cardset || []).forEach(function(card) {
        var box = card.box || '';
        if (!byBox[box]) {
            byBox[box] = { path: box, total: 0, match: 0, prediction: '' };
        }
        byBox[box].total += 1;
        var pred = leafCityFromTree(box);
        if ((!pred || pred === '?') && typeof predictions !== 'undefined' && predictions[box]) {
            pred = predictions[box].prediction || '';
        }
        byBox[box].prediction = pred || '';
        if (pred && pred !== '?' && actualCity(card) === pred) {
            byBox[box].match += 1;
        }
    });
    return Object.keys(byBox).sort().map(function(key) {
        return byBox[key];
    });
}

function scoreCardsetAgainstTree(cardset) {
    var total = (cardset || []).length;
    var match = 0;
    (cardset || []).forEach(function(card) {
        var pred = playerPrediction(card);
        if (pred && pred !== '?' && actualCity(card) === pred) {
            match += 1;
        }
    });
    return {
        total: total,
        match: match,
        percent: total ? Math.round((match / total) * 100) : 0
    };
}

var runSummaryState = {
    training: null,
    test: null,
    view: 'training'
};

function renderLeafStatsHtml(stats) {
    if (!stats || !stats.length) {
        return '<p>No cards landed in leaf boxes.</p>';
    }
    var rows = stats.map(function(row) {
        var pct = row.total ? Math.round((row.match / row.total) * 100) : 0;
        var pred = row.prediction && row.prediction !== '?' ? row.prediction : 'no prediction yet';
        var pathAttr = String(row.path || '').replace(/"/g, '');
        return '<tr data-box-path="' + pathAttr + '"><td>' + branchLabel(row.path) + '</td><td>' + pred +
            '</td><td>' + row.match + ' / ' + row.total + '</td><td>' + pct + '%</td></tr>';
    }).join('');
    return '<table class="game-run-stats"><thead><tr><th>Branch</th><th>Prediction</th><th>Match</th><th>%</th></tr></thead><tbody>' +
        rows + '</tbody></table>';
}

function clearLeafSpotlights() {
    document.querySelectorAll('.game-leaf-slot--spotlight, .game-leaf-dropzone--spotlight').forEach(function(el) {
        el.classList.remove('game-leaf-slot--spotlight', 'game-leaf-dropzone--spotlight');
    });
}

function spotlightLeafBox(path) {
    clearLeafSpotlights();
    var box = document.getElementById('box_' + (path || ''));
    if (!box) {
        return;
    }
    box.classList.add('game-leaf-dropzone--spotlight');
    var slot = box.closest('.game-leaf-slot');
    if (slot) {
        slot.classList.add('game-leaf-slot--spotlight');
    }
}

function bindRunSummaryRowHover() {
    var body = document.getElementById('game-run-summary-body');
    if (!body || body._spotlightBound) {
        return;
    }
    body._spotlightBound = true;
    body.addEventListener('mouseover', function(event) {
        var row = event.target.closest('tr[data-box-path]');
        if (!row || !body.contains(row)) {
            return;
        }
        spotlightLeafBox(row.getAttribute('data-box-path') || '');
    });
    body.addEventListener('mouseleave', function() {
        clearLeafSpotlights();
    });
}

function renderSummaryScoresHtml() {
    var parts = [];
    if (runSummaryState.training) {
        var train = runSummaryState.training.overall;
        parts.push('<button type="button" class="game-run-score' +
            (runSummaryState.view === 'training' ? ' selected' : '') +
            '" data-summary-view="training"><span class="game-run-score-label">Training</span>' +
            '<span class="game-run-score-value">' + train.percent + '%</span>' +
            '<span class="game-run-score-sub">' + train.match + ' / ' + train.total + '</span></button>');
    }
    if (runSummaryState.test) {
        var test = runSummaryState.test.overall;
        parts.push('<button type="button" class="game-run-score' +
            (runSummaryState.view === 'test' ? ' selected' : '') +
            '" data-summary-view="test"><span class="game-run-score-label">Test</span>' +
            '<span class="game-run-score-value">' + test.percent + '%</span>' +
            '<span class="game-run-score-sub">' + test.match + ' / ' + test.total + '</span></button>');
    }
    return parts.join('');
}

function refreshRunSummaryPanel() {
    var panel = document.getElementById('game-run-summary');
    var scores = document.getElementById('game-run-summary-scores');
    var tabs = document.getElementById('game-run-summary-tabs');
    var body = document.getElementById('game-run-summary-body');
    var deck = document.querySelector('.game-training-deck');
    var runTest = document.querySelector('[data-run-test]');
    var enterEval = document.querySelector('[data-enter-evaluation]');
    var backTrain = document.querySelector('[data-back-to-training]');
    if (!panel || !body) {
        return;
    }
    var hasTrain = !!runSummaryState.training;
    var hasTest = !!runSummaryState.test;
    if (!hasTrain && !hasTest) {
        hideRunSummaryPanel();
        return;
    }
    if (runSummaryState.view === 'test' && !hasTest) {
        runSummaryState.view = 'training';
    }
    if (runSummaryState.view === 'training' && !hasTrain && hasTest) {
        runSummaryState.view = 'test';
    }
    var active = runSummaryState[runSummaryState.view];
    if (scores) {
        scores.innerHTML = renderSummaryScoresHtml();
    }
    if (tabs) {
        tabs.classList.toggle('hidden', !(hasTrain && hasTest));
        tabs.querySelectorAll('[data-summary-view]').forEach(function(tab) {
            tab.classList.toggle('selected', tab.getAttribute('data-summary-view') === runSummaryState.view);
        });
    }
    var blurb = runSummaryState.view === 'test'
        ? '<p class="game-run-blurb">Per-leaf matches on the holdout test set:</p>'
        : '<p class="game-run-blurb">Per-leaf matches on the training set:</p>';
    body.innerHTML = blurb + renderLeafStatsHtml(active ? active.stats : []);
    panel.classList.remove('hidden');
    if (deck) {
        deck.classList.add('has-run-summary');
    }
    if (runTest) {
        runTest.classList.remove('hidden');
        runTest.disabled = false;
        runTest.textContent = hasTest ? 'Run another test' : 'Run a test?';
    }
    if (enterEval) {
        enterEval.classList.remove('hidden');
        enterEval.disabled = false;
    }
    if (backTrain) {
        backTrain.classList.remove('hidden');
        var onTraining = (typeof currentPlayMode === 'undefined' || currentPlayMode === 'training');
        backTrain.disabled = !!onTraining;
        backTrain.title = onTraining ? 'Already in training' : 'Return to training and show the cards again';
    }
    bindRunSummaryRowHover();
    clearLeafSpotlights();
}

function setRunSummaryView(view) {
    if (view !== 'training' && view !== 'test') {
        return;
    }
    if (view === 'test' && !runSummaryState.test) {
        return;
    }
    if (view === 'training' && !runSummaryState.training) {
        return;
    }
    runSummaryState.view = view;
    refreshRunSummaryPanel();
}

function hideRunSummaryPanel() {
    var panel = document.getElementById('game-run-summary');
    var deck = document.querySelector('.game-training-deck');
    if (panel) {
        panel.classList.add('hidden');
    }
    if (deck) {
        deck.classList.remove('has-run-summary');
    }
    runSummaryState.training = null;
    runSummaryState.test = null;
    runSummaryState.view = 'training';
    clearLeafSpotlights();
}

function showTrainingRunSummary(cardset) {
    runSummaryState.training = {
        stats: leafMatchStats(cardset),
        overall: scoreCardsetAgainstTree(cardset)
    };
    runSummaryState.test = null;
    runSummaryState.view = 'training';
    refreshRunSummaryPanel();
}

function showTestRunSummary(cardset) {
    runSummaryState.test = {
        stats: leafMatchStats(cardset),
        overall: scoreCardsetAgainstTree(cardset)
    };
    runSummaryState.view = 'test';
    refreshRunSummaryPanel();
}

function startGuidedTest() {
    if (typeof ensureLeafPredictionsForEval === 'function') {
        var finalizeError = ensureLeafPredictionsForEval(cards.trainingSet);
        if (finalizeError) {
            alert(finalizeError);
            return;
        }
    }
    if (!modelHasRun && !confidences.player && confidences.player !== 0) {
        alert('Run your model on the training set first.');
        return;
    }
    if (typeof setPlayMode === 'function') {
        setPlayMode('test', { force: true });
    }
    reshuffleAndDealTestSet(20);
    window.setTimeout(function() {
        if (window.gameTree && typeof window.gameTree.showAllLeafCards === 'function') {
            window.gameTree.showAllLeafCards();
        }
        sortCards(cards.testSet, 'p');
    }, 550);
}

function setElementToOption(elementid, option) {
    var select = document.getElementById(elementid);
    if (!select) {
        return;
    }
    for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === option) {
            select.options[i].selected = true;
        }
    }
}

function actualCity(card) {
    if (card.target === 0 || card.target === '0') {
        return 'New York';
    }
    if (card.target === 1 || card.target === '1') {
        return 'San Francisco';
    }
    return card.city;
}

function evaluateTree(tree, card) {
    var node = tree;
    while (node && !node.leaf) {
        if (parseFloat(card[node.feature]) <= parseFloat(node.threshold)) {
            node = node.left;
        } else {
            node = node.right;
        }
    }
    return node ? node.leaf : null;
}

function playerPrediction(card) {
    var tree = currentTreeModel();
    if (typeof TreeScore !== 'undefined' && TreeScore.predict) {
        return TreeScore.predict(tree, card);
    }
    var position = '';
    for (var depth = 0; depth < 3; depth++) {
        var factorKey = position === '' ? '_' : position;
        var boundaryKey = position === '' ? 'a' : position + 'a';
        var factor = tree.factors && tree.factors[factorKey];
        var boundary = tree.boundaries && tree.boundaries[boundaryKey];
        if (!factor || boundary === '' || boundary === undefined || boundary === null) {
            break;
        }
        if (parseFloat(card[factor]) <= parseFloat(boundary)) {
            position += 'l';
        } else {
            position += 'r';
        }
    }
    if (predictions[position] && predictions[position].prediction && predictions[position].prediction !== '?') {
        return predictions[position].prediction;
    }
    return null;
}

function leafCityFromTree(path) {
    if (!window.gameTree || typeof window.gameTree.find !== 'function') {
        return '';
    }
    var node = window.gameTree.find(path);
    if (node && node.mode === 'leaf' && node.city && node.city !== '?') {
        return node.city;
    }
    return '';
}

function predictionsComplete(cardset) {
    assignBoxes(cardset || (typeof cards !== 'undefined' ? cards.trainingSet : []));
    var set = cardset || (typeof cards !== 'undefined' ? cards.trainingSet : []);
    if (!set || !set.length) {
        return false;
    }
    for (var i = 0; i < set.length; i++) {
        var box = set[i].box;
        if (!box) {
            return false;
        }
        var prediction = leafCityFromTree(box) ||
            (predictions[box] && predictions[box].prediction);
        if (!prediction || prediction === '?') {
            return false;
        }
    }
    return true;
}

function getPredictions(cardset, keepExisting, options) {
    options = options || {};
    var applyToTree = options.applyToTree === true;
    var counts = {};
    cardset.forEach(function(card) {
        if (!card.box) {
            return;
        }
        if (!counts[card.box]) {
            counts[card.box] = { 'New York': 0, 'San Francisco': 0 };
        }
        if (counts[card.box][card.city] !== undefined) {
            counts[card.box][card.city] += 1;
        }
    });
    var right = 0;
    Object.keys(counts).forEach(function(box) {
        var values = counts[box];
        if (!predictions[box]) {
            predictions[box] = {};
        }
        predictions[box]['New York'] = values['New York'];
        predictions[box]['San Francisco'] = values['San Francisco'];

        var treeCity = leafCityFromTree(box);
        var existing = predictions[box].prediction;
        var prediction = treeCity || existing;
        if (applyToTree && (!keepExisting || !prediction || prediction === '?')) {
            prediction = majorityCityFromCounts(values) || prediction;
        }
        if (treeCity) {
            prediction = treeCity;
        }
        if (!applyToTree && !treeCity) {
            // Keep vote counts, but do not invent a leaf prediction until End branch.
            if (!existing || existing === '?') {
                prediction = '';
            }
        }
        predictions[box].prediction = prediction || existing || '';
        if (prediction && prediction !== '?') {
            setElementToOption('prediction_box_' + box, prediction);
            right += values[prediction] || 0;
        }
    });
    confidences.player = Math.round((right / 20) * 100);
    if (OPPONENTS) {
        confidences.machine = OPPONENTS.overfitted.confidence;
        confidences.hybrid = OPPONENTS.humanGuided.confidence;
        var machineEl = document.getElementById('confidence-stoopid-ai');
        var hybridEl = document.getElementById('confidence-hybrid');
        if (machineEl) {
            machineEl.innerHTML = confidences.machine + '%';
        }
        if (hybridEl) {
            hybridEl.innerHTML = confidences.hybrid + '%';
        }
    }
    $('.prediction').show();
    var userEl = document.getElementById('confidence-user');
    if (userEl) {
        userEl.innerHTML = confidences.player + '%';
    }
    $('.evaluation-button').show();

    if (applyToTree && window.gameTree && typeof window.gameTree.applyLeafCities === 'function') {
        var cityMap = {};
        Object.keys(predictions).forEach(function(box) {
            if (predictions[box] && predictions[box].prediction && predictions[box].prediction !== '?') {
                cityMap[box] = predictions[box].prediction;
            }
        });
        window.gameTree.applyLeafCities(cityMap);
        restoreCardsToBoxes(cardset);
    }
    saveData();
}

function ensureLeafPredictionsForEval(cardset) {
    var set = cardset || (typeof cards !== 'undefined' ? cards.trainingSet : []);
    if (!set || !set.length) {
        return 'Run your model on the training cards first.';
    }
    if (!modelHasRun) {
        return 'Run your model on the training set before you can proceed.';
    }
    if (!window.gameTree) {
        return 'Build your decision tree first.';
    }
    assignBoxes(set);
    window.gameTree.readFromDom();

    var cityMap = {};
    var problems = [];

    function walk(path, node) {
        if (!node || node.mode === 'leaf') {
            if (node && node.city && node.city !== '?') {
                cityMap[path] = node.city;
                return;
            }
            var majority = majorityCityFromCounts(boxCityCounts(path, set));
            if (majority && majority !== '?') {
                cityMap[path] = majority;
                return;
            }
            if (majority === '?') {
                problems.push('Branch "' + (path || 'root') + '" is tied 50/50 — choose NY or SF.');
            } else {
                problems.push('Branch "' + (path || 'root') + '" has no cards — end it and choose NY or SF.');
            }
            return;
        }
        walk(path + 'l', node.left);
        walk(path + 'r', node.right);
    }

    walk('', window.gameTree.root);
    if (problems.length) {
        return problems.join('\n');
    }

    window.gameTree.applyLeafCities(cityMap);
    restoreCardsToBoxes(set);
    getPredictions(set, true, { applyToTree: false });
    return null;
}

function updateConfidence(cardset) {
    assignBoxes(cardset);
    var right = 0;
    cardset.forEach(function(card) {
        var prediction = predictions[card.box] && predictions[card.box].prediction;
        if (prediction && prediction === card.city) {
            right += 1;
        }
    });
    confidences.player = Math.round((right / 20) * 100);
    document.getElementById('confidence-user').innerHTML = confidences.player + '%';
}

function countMatches(cardset, predict) {
    var right = 0;
    cardset.forEach(function(card) {
        if (predict(card) === actualCity(card)) {
            right += 1;
        }
    });
    return right;
}

function scoreAgainst(cardset, number, kind, confidence, predict, winPoints, drawPoints, losePoints) {
    var percent = Math.round((countMatches(cardset, predict) / cardset.length) * 100);
    results[number][kind] = percent;
    var diff = Math.abs(confidence - percent);
    var bucket = kind === 'machine' ? results.vsMachine : results.vsHybrid;
    var label;
    if (results[number].playerDiff < diff) {
        results[number].score += winPoints;
        bucket.win += 0.25;
        label = '<b>+' + winPoints + '</b><br/>(You win)';
    } else if (results[number].playerDiff === diff) {
        results[number].score += drawPoints;
        bucket.draw += 0.25;
        label = '<b>+' + drawPoints + '</b><br/>(Draw)';
    } else {
        results[number].score += losePoints;
        bucket.lost += 0.25;
        label = '<b>' + (losePoints === 0 ? '+0' : String(losePoints)) + '</b><br/>(You lose)';
    }
    results[number][kind + 'Label'] = label;
}

function scoreRun(cardset, number) {
    var right = countMatches(cardset, playerPrediction);
    var percent = Math.round((right / cardset.length) * 100);
    results[number].player = percent;
    results[number].playerDiff = Math.abs(confidences.player - percent);
    var playerScore = percent - results[number].playerDiff;
    results[number].score = playerScore;
    if (!OPPONENTS) {
        return;
    }
    scoreAgainst(cardset, number, 'hybrid', confidences.hybrid, function(card) {
        return evaluateTree(OPPONENTS.humanGuided.tree, card);
    }, 25, 10, 0);
    scoreAgainst(cardset, number, 'machine', confidences.machine, function(card) {
        return evaluateTree(OPPONENTS.overfitted.tree, card);
    }, 10, 0, -20);
}

function paintRun(number) {
    var run = results[number];
    $('#result' + number + '-user').html(run.player + '<br/>' + run.playerDiff + '<br/><b>' + (run.player - run.playerDiff) + '</b>');
    if (run.hybridLabel) {
        $('#result' + number + '-hybrid').html(run.hybridLabel);
    }
    if (run.machineLabel) {
        $('#result' + number + '-stoopid-ai').html(run.machineLabel);
    }
    $('#result' + number + '-score').html('<b>' + run.score + '</b>');
}

function showRun(cardset, number) {
    clearRendered(cards.evaluationSet, 'r');
    cards.evaluationSet = cardset;
    cardset.forEach(function(card) {
        renderRedCard(card, card.index, 'red');
        rCount += 1;
        rDone[card.index] = true;
    });
    paintRun(number);
    sortCards(cardset, 'r', number);
}

function finishEvaluation() {
    $('#result1-score').html('<b>' + results[1].score + '</b>');
    $('#result2-score').html('<b>' + results[2].score + '</b>');
    $('#result3-score').html('<b>' + results[3].score + '</b>');
    $('#result4-score').html('<b>' + results[4].score + '</b>');
    results.score = confidences.player + results[1].score + results[2].score + results[3].score + results[4].score;
    var guide = '<table class="results" style="font-size: 0.8em; max-width: 66%; margin-left: auto; margin-right: auto;"><tr><td>500+</td><td>Incredible!</td></tr><tr><td>450 - 500</td><td>Expert</td></tr><tr><td>400 - 450</td><td>Solid effort</td></tr><tr><td>300 - 400</td><td>Average</td></tr><tr><td>0 - 300</td><td>Points for trying (did you overfit?)</td></tr></table>';
    $('#evaluationStatus').html('Your score: ' + results.score + '<br/><br/>' + guide);
    if (typeof replayOnly === 'undefined' || !replayOnly) {
        saveResult();
    }
    if (typeof loadLeaderboards === 'function' && leaderboardId) {
        loadLeaderboards();
    }
}

function playRuns(runs, number) {
    $('#evaluationStatus').html('Showing run ' + number);
    showRun(runs[number - 1], number);
    if (number < 4) {
        setTimeout(function() {
            playRuns(runs, number + 1);
        }, 8000);
    } else {
        setTimeout(finishEvaluation, 6000);
    }
}

function autoEvaluate() {
    if (typeof entryMode !== 'undefined' && entryMode && typeof applyRecordingSheet === 'function') {
        applyRecordingSheet();
    }
    if (!confidences.player && confidences.player !== 0) {
        assignBoxes(cards.trainingSet);
        getPredictions(cards.trainingSet, typeof entryMode !== 'undefined' && entryMode);
    }
    if (OPPONENTS) {
        confidences.machine = OPPONENTS.overfitted.confidence;
        confidences.hybrid = OPPONENTS.humanGuided.confidence;
    }
    results = {
        vsMachine: { win: 0, draw: 0, lost: 0 },
        vsHybrid: { win: 0, draw: 0, lost: 0 }
    };
    var runs = [];
    for (var number = 1; number <= 4; number++) {
        var runCards = cardsForRun(number);
        results[number] = { score: 0 };
        scoreRun(runCards, number);
        runs.push(runCards);
    }
    var primary = document.getElementById('play-primary-action');
    if (primary) {
        primary.classList.add('hidden');
    }
    var rerun = document.getElementById('rerunEvaluation');
    if (rerun) {
        rerun.classList.remove('hidden');
    }
    playRuns(runs, 1);
}

window.addEventListener('keydown', function(event) {
    if (event.key === '=') {
        $('.model-button').show();
    }
}, false);
