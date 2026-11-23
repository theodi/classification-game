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

var GAME_FEATURES = [];
var OPPONENTS = null;
var EVAL_SETS = null;
var EVAL_POOL = [];

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
    return '<card draggable="true" class="draggable drag-drop card-' + type + '" id="' + idPrefix + count + '"><h1 class="target">' + data.city + '</h1><h1 class="number">#' + count + '</h1><image src="/img/house.png"></image><table class="' + color + '">' + featureRows(data, type === 'test') + '</table></card>';
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
    var hidden = Object.assign({}, data, { city: '?' });
    $('#test-set').append(cardMarkup(hidden, count, color, 'test', 'p'));
}

function renderCards(cardList, type) {
    cardList.forEach(function(card) {
        renderCard(card, card.index, 'blue', type);
    });
}

function getRandomPurples(count) {
    var pool = cards.trainingSet.slice();
    var i = pool.length;
    while (i > 0) {
        var swap = Math.floor(Math.random() * i);
        i -= 1;
        var held = pool[i];
        pool[i] = pool[swap];
        pool[swap] = held;
    }
    pool.slice(0, count).forEach(function(card, index) {
        var copy = Object.assign({}, card, { index: index + 1 });
        cards.testSet.push(copy);
        renderPurpleCard(copy, copy.index, 'purple');
        pCount += 1;
    });
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

function sortCard(card, currentPosition) {
    if (currentPosition === '') {
        card.box = '';
    }
    var factor = $('#factor_' + currentPosition).val();
    var boundary = $('#condition_' + currentPosition + 'a').val();
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
    assignBoxes(cardset);
    var interval = 0;
    cardset.forEach(function(card) {
        $('#' + color + card.index).removeAttr('style');
        setTimeout(function() {
            animateCard(card, color);
        }, interval);
        interval += 200;
    });
    if (color === 'b') {
        setTimeout(function() {
            getPredictions(cardset, typeof entryMode !== 'undefined' && entryMode);
        }, 500);
    }
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
    var position = '';
    for (var depth = 0; depth < 3; depth++) {
        var factor = $('#factor_' + position).val();
        var boundary = $('#condition_' + position + 'a').val();
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
    var select = document.getElementById('prediction_box_' + position);
    if (select && select.value && select.value !== '?') {
        return select.value;
    }
    return null;
}

function getPredictions(cardset, keepExisting) {
    var counts = {};
    cardset.forEach(function(card) {
        if (!counts[card.box]) {
            counts[card.box] = { 'New York': 0, 'San Francisco': 0 };
        }
        counts[card.box][card.city] += 1;
    });
    var right = 0;
    Object.keys(counts).forEach(function(box) {
        var values = counts[box];
        var existing = predictions[box] && predictions[box].prediction;
        if (!predictions[box]) {
            predictions[box] = {};
        }
        predictions[box]['New York'] = values['New York'];
        predictions[box]['San Francisco'] = values['San Francisco'];
        var prediction = existing;
        if (!keepExisting || !prediction || prediction === '?') {
            if (values['New York'] > values['San Francisco']) {
                prediction = 'New York';
            } else if (values['New York'] < values['San Francisco']) {
                prediction = 'San Francisco';
            } else {
                prediction = '?';
            }
        }
        predictions[box].prediction = prediction;
        setElementToOption('prediction_box_' + box, prediction);
        if (prediction && prediction !== '?') {
            right += values[prediction] || 0;
        }
    });
    confidences.player = Math.round((right / 20) * 100);
    if (OPPONENTS) {
        confidences.machine = OPPONENTS.overfitted.confidence;
        confidences.hybrid = OPPONENTS.humanGuided.confidence;
        document.getElementById('confidence-stoopid-ai').innerHTML = confidences.machine + '%';
        document.getElementById('confidence-hybrid').innerHTML = confidences.hybrid + '%';
    }
    $('.prediction').show();
    document.getElementById('confidence-user').innerHTML = confidences.player + '%';
    $('.evaluation-button').show();
    saveData();
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
    $('#evaluationButton').hide();
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
