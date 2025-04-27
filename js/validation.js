// js/validation.js

// This module contains the logic for validating question data in the UI.
// It reads directly from the DOM elements and applies validation styles.

const Validation = (function() {

    const QUESTION_TYPES = {
        SINGLE: 'single',
        MULTI_SELECT: 'multi-select',
        FILL_IN: 'fill-in',
        ORDERING: 'ordering'
    };

    const CSS_CLASSES = {
        INVALID: 'invalid'
    };

    // Helper to remove invalid class from elements within a parent
    function resetValidationStyles(parentElement) {
        if (parentElement) { // Check if parentElement exists
            parentElement.querySelectorAll(`.${CSS_CLASSES.INVALID}`).forEach(el => el.classList.remove(CSS_CLASSES.INVALID));
             // Also check the parent itself if it might have the class
             if (parentElement.classList.contains(CSS_CLASSES.INVALID)) {
                  parentElement.classList.remove(CSS_CLASSES.INVALID);
             }
        }
    }

    // Validates a single question block element in the UI
    // Returns true if valid, false otherwise. Applies .invalid class to invalid fields.
    function validateQuestionBlockUI(questionBlockElement) {
        let isValid = true;
        resetValidationStyles(questionBlockElement); // Reset styles first

        const type = questionBlockElement.querySelector('.questionType').value;
        const questionTextarea = questionBlockElement.querySelector('.questionText');
        const optionsContainer = questionBlockElement.querySelector('.options-container'); // Need this for option inputs
        const optionsInputs = optionsContainer ? optionsContainer.querySelectorAll('.option-input') : [];
        const correctAnswerInput = questionBlockElement.querySelector('.correctAnswer'); // Fill-in
        const answerOptionsDiv = questionBlockElement.querySelector('.answerOptions'); // Radio/Checkbox container
        const answerOptionsInputs = answerOptionsDiv ? answerOptionsDiv.querySelectorAll('input') : []; // Radio/Checkbox inputs
        const orderContainer = questionBlockElement.querySelector('.order-options'); // Ordering container
        const orderInputs = orderContainer ? orderContainer.querySelectorAll('.order-input') : []; // Ordering numbers
        // const questionNumber = questionBlockElement.querySelector('.question-number').textContent; // For console messages


        // 1. Question Text is always required
        if (questionTextarea.value.trim() === '') {
            questionTextarea.classList.add(CSS_CLASSES.INVALID);
            isValid = false;
            // console.log(`${questionNumber}: Question text is empty.`);
        }

        // 2. Options are required for specific types
        const requiresOptions = [QUESTION_TYPES.SINGLE, QUESTION_TYPES.MULTI_SELECT, QUESTION_TYPES.ORDERING].includes(type);
        if (requiresOptions) {
             // Check if the options container exists (it should if requiresOptions is true)
             if (!optionsContainer) {
                 console.error(`Validation Error: Options container missing for ${type} question.`);
                 isValid = false; // Critical error
             } else {
                const options = Array.from(optionsInputs).map(input => input.value.trim());
                const validOptions = options.filter(v => v);

                // Require at least 2 *valid* options
                if (validOptions.length < 2) {
                     isValid = false;
                     // console.log(`${questionNumber}: Not enough valid options (${validOptions.length}).`);
                }

                // Mark *any* empty option inputs as invalid if options are required
                optionsInputs.forEach(input => {
                     if (input.value.trim() === '') {
                         input.classList.add(CSS_CLASSES.INVALID);
                         isValid = false; // Mark block as invalid if any option input is empty
                     }
                });
             }
        }

        // 3. Answer is required based on type
        if (type === QUESTION_TYPES.FILL_IN) {
            if (!correctAnswerInput || correctAnswerInput.value.trim() === '') {
                if (correctAnswerInput) correctAnswerInput.classList.add(CSS_CLASSES.INVALID);
                isValid = false;
                // console.log(`${questionNumber}: Fill-in answer is empty.`);
            }
        } else if (type === QUESTION_TYPES.SINGLE || type === QUESTION_TYPES.MULTI_SELECT) {
            // Need to check if the answerOptions div exists and if any option is checked
            if (!answerOptionsDiv) {
                // This state indicates a rendering issue, but technically invalid for saving
                console.error(`Validation Error: Answer options container missing for ${type} question.`);
                isValid = false; // Critical error
            } else {
                 const selectedAnswers = Array.from(answerOptionsInputs).filter(input => input.checked);
                 const hasOptionsRendered = answerOptionsInputs.length > 0;

                 // Check if there are options rendered AND if any are selected
                 if (!hasOptionsRendered || selectedAnswers.length === 0) {
                     // Mark all *rendered* answer inputs as invalid if none are selected or no options exist
                      answerOptionsInputs.forEach(input => input.classList.add(CSS_CLASSES.INVALID));
                      // If there are valid options *inputs* (from step 2) but no *selected* answer options, it's invalid.
                      // We rely on the options validation (step 2) to ensure there are options available to select.
                      if (selectedAnswers.length === 0 && requiresOptions && Array.from(optionsInputs).filter(input => input.value.trim()).length >= 2) {
                           isValid = false;
                           // console.log(`${questionNumber}: No correct answer selected.`);
                      }
                 }
            }
        } else if (type === QUESTION_TYPES.ORDERING) {
            // Check if the order container exists
            if (!orderContainer) {
                 console.error(`Validation Error: Order options container missing for Ordering question.`);
                 isValid = false; // Critical error
            } else {
                const options = Array.from(optionsInputs).map(input => input.value.trim()).filter(v => v); // Validated options from step 2
                const orderInputsList = Array.from(orderInputs); // Convert NodeList to Array

                // Check if the number of order inputs matches the number of valid options
                if (orderInputsList.length === 0 || orderInputsList.length !== options.length) {
                    // Mark existing order inputs if count is wrong
                    orderInputsList.forEach(input => input.classList.add(CSS_CLASSES.INVALID));
                    // Rely on step 2 to mark option inputs if counts don't match valid options
                    isValid = false;
                    // console.log(`${questionNumber}: Ordering setup mismatch or no order items.`);
                } else {
                    const orderNumbers = orderInputsList.map(input => parseInt(input.value));
                    const hasInvalidOrder = orderNumbers.some(isNaN) || orderNumbers.some(o => o < 1 || o > options.length);
                    const hasDuplicateOrder = new Set(orderNumbers).size !== orderNumbers.length;

                    if (hasInvalidOrder || hasDuplicateOrder) {
                        orderInputsList.forEach((input, index) => {
                            const order = parseInt(input.value);
                            // Add invalid class if NaN, <1, >options.length, or if it's a duplicate
                            // Find index of current order number in the list; if it's not the first occurrence, it's a duplicate
                            const firstIndex = orderNumbers.indexOf(order);
                            if (isNaN(order) || order < 1 || order > options.length || (firstIndex !== -1 && firstIndex !== index)) {
                                input.classList.add(CSS_CLASSES.INVALID);
                            }
                        });
                        isValid = false;
                        // console.log(`${questionNumber}: Invalid or duplicate order numbers.`);
                    }
                }
            }
        }

        // Return true if all checks passed for this block
        // Note: isValid accumulates failures, so if any check failed, it will be false
        return isValid;
    }

    // Validates the metadata fields
    // Returns true if valid, false otherwise. Applies .invalid class to invalid fields.
    function validateMetadata(subjectInput, gradeInput) {
        let isValid = true;
        // Reset styles should be handled by the caller (e.g., validateAll) for metadata inputs

        if (subjectInput.value.trim() === '') {
            subjectInput.classList.add(CSS_CLASSES.INVALID);
            isValid = false;
        } else {
             subjectInput.classList.remove(CSS_CLASSES.INVALID);
        }

        if (gradeInput.value.trim() === '') {
            gradeInput.classList.add(CSS_CLASSES.INVALID);
            isValid = false;
        } else {
             gradeInput.classList.remove(CSS_CLASSES.INVALID);
        }

        // setNameInput is not strictly required based on your current logic,
        // so it doesn't need validation here for saving.

        return isValid;
    }


    // Validates all questions and metadata in the UI
    // Returns true if the entire form is valid for saving, false otherwise.
    // Applies/removes .invalid classes across the form.
    function validateAll(questionsContainer, subjectInput, gradeInput) {
        let allValid = true;

        // 1. Validate metadata
        // Reset metadata styles here before validation
        resetValidationStyles(subjectInput);
        resetValidationStyles(gradeInput);
        // No need to reset setNameInput as it's not validated for requiredness

        if (!validateMetadata(subjectInput, gradeInput)) {
             allValid = false;
        }

        // 2. Validate question blocks
        const questionBlocks = questionsContainer.querySelectorAll('.question-block');

        // Reset styles for all question blocks first
        questionBlocks.forEach(block => resetValidationStyles(block));


        if (questionBlocks.length === 0) {
            allValid = false; // Cannot save if there are no questions
        } else {
            questionBlocks.forEach(block => {
                // validateQuestionBlockUI already updates the individual inputs' classes
                if (!validateQuestionBlockUI(block)) {
                    allValid = false;
                }
            });
        }

        return allValid; // Return overall validity state
    }


    // Public API
    return {
        validateQuestionBlockUI, // Expose for individual block validation (e.g., on input)
        validateAll // Expose for checking overall save readiness and applying all styles
    };
})();
