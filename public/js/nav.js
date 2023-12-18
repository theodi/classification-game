
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
            }
            if (targetId === "evaluation" && requireEvaluationPin && success) {
                success = false;
                console.log('in here');
                // Prompt the user for a 4-digit pin containing the 5-digit numeric
                const userInput = prompt(`Enter the evaluation pin. Your session ID is ${randomPin}.`);

                // Check if the user's input is a valid 4-digit number
                if (/^\d{4}$/.test(userInput)) {
                    // Check if the user's input matches the generated 4-digit pin
                    if (userInput === requiredPasscode) {
                        success = true;
                    }
                }
            }
            if (success) {
                document.querySelectorAll('section').forEach(section => {
                    section.classList.add('hidden');
                });
                document.getElementById(targetId).classList.remove('hidden');
            } else {
                return;
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
