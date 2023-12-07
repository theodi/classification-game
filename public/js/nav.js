
var chartRendered = false;
$(document).ready( function () {
    addListeners();
    document.querySelectorAll('.toggle-link').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            let success = true;
            if (targetId === "test" || targetId === "evaluation") {
                if (!predictionsComplete(cards.trainingSet)) {
                    alert('You must ensure you have a valid prediction (not ?) for all branch ends in your tree before you can continue.');
                    success = false;
                }
                if (!confidences.player) {
                    alert('You must run your model on the training set before you can proceed to test or evaluation.');
                    success = false;
                }
            }/*
            if (targetId === "evaluation" && !player_name) {
                changeName();
            }
            */
            if (success) {
                document.querySelectorAll('section').forEach(section => {
                    section.classList.add('hidden');
                });
                document.getElementById(targetId).classList.remove('hidden');
            }
            if (targetId === "charts" && !chartRendered) {
                renderChart();
            }
            try {
                document.getElementById('decisionTree').classList.add('hidden');
                if (targetId === "training" || targetId === "test" || targetId === "evaluation") {
                    document.getElementById('decisionTree').classList.remove('hidden');
                }
                if ((targetId === "test" || targetId === "evaluation") && predictionsComplete(cards.trainingSet) && confidences.player !== false) {
                    var form = document.getElementById('decisionTreeForm');
                    var selectElements = form.querySelectorAll('select');
                    selectElements.forEach(function(selectElement) {
                        selectElement.disabled = true;
                    });
                    var userInputElements = document.querySelectorAll('.userInput');
                    userInputElements.forEach(function(inputElement) {
                        inputElement.disabled = true;
                    });

                    var browseButtons = document.getElementsByClassName('browseButton');
                    for (var i = 0; i < browseButtons.length; i++) {
                        browseButtons[i].style.display = 'none';
                    }
                    if (targetId === "test") {
                        returnCardsInstant(cards.trainingSet,'training-set','b');
                        returnCardsInstant(cards.evaluationSet,'evaluation-set','r');
                    }
                    if (targetId === "evaluation") {
                        returnCardsInstant(cards.trainingSet,'training-set','b');
                        returnCardsInstant(cards.testSet,'test-set','p');
                    }
                } else if (targetId === "training") {
                    var form = document.getElementById('decisionTreeForm');
                    var selectElements = form.querySelectorAll('select');
                    selectElements.forEach(function(selectElement) {
                        selectElement.disabled = false;
                    });
                    var userInputElements = document.querySelectorAll('.userInput');
                    userInputElements.forEach(function(inputElement) {
                        inputElement.disabled = false;
                    })
                    var browseButtons = document.getElementsByClassName('browseButton');
                    for (var i = 0; i < browseButtons.length; i++) {
                        browseButtons[i].style.display = 'block';
                    }
                    returnCardsInstant(cards.testSet,'test-set','p');
                    returnCardsInstant(cards.evaluationSet,'evaluation-set','r');
                }
            } catch (err) {

            }
        });
    });
});
