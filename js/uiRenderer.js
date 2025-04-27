// js/uiRenderer.js

// This module handles creating, updating, and reading data from DOM elements.
// It should interact with the DOM but not hold the primary question data state
// or contain core validation rules.

const UIRenderer = (function() {

    // References to key DOM elements
    const DOM = {
        questionsContainer: document.getElementById('questionsContainer'),
        addQuestionBtn: document.getElementById('addQuestionBtn'), // Add button reference here
        saveQuestionsBtn: document.getElementById('saveQuestionsBtn'),
        previewQuestionSelect: document.getElementById('previewQuestionSelect'),
        questionPreviewArea: document.getElementById('questionPreviewArea'),
        subjectInput: document.getElementById('subject'),
        gradeInput: document.getElementById('grade'),
        setNameInput: document.getElementById('setName'),
    };

    const QUESTION_TYPES = { // Define types locally for clarity
        SINGLE: 'single',
        MULTI_SELECT: 'multi-select',
        FILL_IN: 'fill-in',
        ORDERING: 'ordering'
    };

    // Helper function to get a specific question block element by its internal ID
    function getQuestionBlockElement(questionId) {
        return DOM.questionsContainer.querySelector(`.question-block[data-question-id="${questionId}"]`);
    }

     // Helper function to get data from a single question block element in the UI
     // This function reads the current state directly from the DOM elements
     // NOTE: This function is primarily for editor.js to read UI state.
     function getQuestionDataFromBlock(questionBlockElement) {
         const questionId = questionBlockElement.dataset.questionId;

         const type = questionBlockElement.querySelector('.questionType').value;
         const questionText = questionBlockElement.querySelector('.questionText').value.trim();
         const rationale = questionBlockElement.querySelector('.rationale').value.trim();
         const hint = questionBlockElement.querySelector('.hint').value.trim();

         const questionData = {
             id: questionId,
             Question: questionText,
             Rationale: rationale || "",
             hint: hint || "",
             type: type,
             Options: undefined,
             answer: undefined
         };

         if ([QUESTION_TYPES.SINGLE, QUESTION_TYPES.MULTI_SELECT, QUESTION_TYPES.ORDERING].includes(type)) {
             const options = Array.from(questionBlockElement.querySelectorAll('.optionsList .option-input'))
                 .map(input => input.value.trim()); // Include empty options here; validation handles emptiness
             questionData.Options = options;

             if (type === QUESTION_TYPES.SINGLE || type === QUESTION_TYPES.MULTI_SELECT) {
                 const selectedAnswers = Array.from(questionBlockElement.querySelectorAll('.answerOptions input:checked'))
                     .map(input => input.value);
                 questionData.answer = type === QUESTION_TYPES.SINGLE ? (selectedAnswers.length > 0 ? selectedAnswers[0] : null) : selectedAnswers;

             } else if (type === QUESTION_TYPES.ORDERING) {
                 const orderItems = Array.from(questionBlockElement.querySelectorAll('.order-options div'));
                 const orderedOptionsWithOrder = orderItems.map(item => {
                         const textSpan = item.querySelector('span');
                         const orderInput = item.querySelector('.order-input');
                         const value = textSpan ? textSpan.textContent.trim() : '';
                         const order = orderInput ? parseInt(orderInput.value) : NaN;
                         return {
                             value,
                             order
                         };
                     })
                     .filter(item => item.value);

                 orderedOptionsWithOrder.sort((a, b) => {
                      const orderA = isNaN(a.order) ? Infinity : a.order;
                      const orderB = isNaN(b.order) ? Infinity : b.order;
                      return orderA - orderB;
                 });

                 questionData.answer = orderedOptionsWithOrder.map(item => item.value);
             }

         } else if (type === QUESTION_TYPES.FILL_IN) {
             const correctAnswerInput = questionBlockElement.querySelector('.correctAnswer');
             const correctAnswer = correctAnswerInput ? correctAnswerInput.value.trim() : '';
             questionData.answer = correctAnswer;
         }

         return questionData;
     }


    // Function to render/add a new question block to the UI
    // Takes questionData as input to populate fields
    function renderQuestionBlock(questionData) {
        const questionBlockId = questionData.id;
        const displayIndex = DOM.questionsContainer.querySelectorAll('.question-block').length + 1;

        const questionBlockElement = document.createElement('div');
        questionBlockElement.classList.add('question-block');
        questionBlockElement.dataset.questionId = questionBlockId;

        questionBlockElement.innerHTML = `
            <div class="question-header">
                <span class="question-number">Question #${displayIndex}</span>
                <button type="button" class="remove-question-btn"><i class="fas fa-trash-alt"></i> Remove</button>
            </div>
            <div class="form-group">
                <label for="${questionBlockId}-type" class="required"><i class="fas fa-question-circle"></i> Question Type:</label>
                <select class="questionType" id="${questionBlockId}-type">
                    <option value="${QUESTION_TYPES.SINGLE}" ${questionData.type === QUESTION_TYPES.SINGLE ? 'selected' : ''}>Single Answer</option>
                    <option value="${QUESTION_TYPES.MULTI_SELECT}" ${questionData.type === QUESTION_TYPES.MULTI_SELECT ? 'selected' : ''}>Multiple Answers</option>
                    <option value="${QUESTION_TYPES.FILL_IN}" ${questionData.type === QUESTION_TYPES.FILL_IN ? 'selected' : ''}>Fill in the Blank</option>
                    <option value="${QUESTION_TYPES.ORDERING}" ${questionData.type === QUESTION_TYPES.ORDERING ? 'selected' : ''}>Put in Order</option>
                </select>
            </div>

            <div class="form-group">
                <label for="${questionBlockId}-text" class="required"><i class="fas fa-align-left"></i> Question Text:</label>
                <textarea class="questionText" id="${questionBlockId}-text" rows="3">${questionData.Question || ''}</textarea>
            </div>

            <div class="options-container">
                <label class="required"><i class="fas fa-list"></i> Options:</label>
                <div class="optionsList">
                    <!-- Option items will be added here by renderOptionInputs -->
                </div>
                <button type="button" class="add-option-btn"><i class="fas fa-plus-circle"></i> Add Option</button>
            </div>

            <div class="answer-section">
                <!-- Answer UI will be rendered here by updateAnswerUI -->
            </div>

            <div class="form-group">
                <label for="${questionBlockId}-rationale"><i class="fas fa-info-circle"></i> Rationale:</label>
                <textarea class="rationale" id="${questionBlockId}-rationale" rows="2">${questionData.Rationale || ''}</textarea>
            </div>

            <div class="form-group">
                <label for="${questionBlockId}-hint"><i class="fas fa-lightbulb"></i> Hint:</label>
                <input type="text" class="hint" id="${questionBlockId}-hint" placeholder="Optional hint" value="${questionData.hint || ''}">
            </div>
        `;

        DOM.questionsContainer.appendChild(questionBlockElement); // Append the created element

        // Render options and answer UI based on the data provided
        renderOptionInputs(questionBlockElement, questionData.Options || ['']); // Render at least one empty option input if none exist
        updateAnswerUI(questionBlockElement, questionData.answer); // Pass the answer data to populate answer section

        updateRemoveOptionButtons(questionBlockElement); // Ensure remove button visibility is correct initially

        return questionBlockElement; // Return the newly created element
    }

    // Function to remove a question block from the UI
    function removeQuestionBlock(questionBlockElement) {
         questionBlockElement.remove();
         // Re-number remaining questions for display
         DOM.questionsContainer.querySelectorAll('.question-block').forEach((block, index) => {
              block.querySelector('.question-number').textContent = `Question #${index + 1}`;
         });
    }


    // Function to render the option input fields for a question block
    // Takes an array of option text strings
    function renderOptionInputs(questionBlockElement, options) {
        const optionsList = questionBlockElement.querySelector('.optionsList');
        if (!optionsList) return;

        optionsList.innerHTML = ''; // Clear existing inputs

        // Ensure there's at least one option input if the question type requires options
        const type = questionBlockElement.querySelector('.questionType').value;
        const requiresOptions = [QUESTION_TYPES.SINGLE, QUESTION_TYPES.MULTI_SELECT, QUESTION_TYPES.ORDERING].includes(type);
        const optionsToRender = requiresOptions && (!options || options.length === 0) ? [''] : options;


        (optionsToRender || []).forEach((optionText = '') => { // Default to empty string if option is null/undefined
            const newOptionItem = document.createElement('div');
            newOptionItem.className = 'option-item';

            const input = document.createElement('input');
            input.type = 'text';
            input.classList.add('option-input');
            input.placeholder = 'Option Text';
            input.value = optionText.replace(/"/g, '&quot;');

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.classList.add('remove-option-btn');
            removeButton.innerHTML = '<i class="fas fa-minus-circle"></i>';

            newOptionItem.appendChild(input);
            newOptionItem.appendChild(removeButton);

            optionsList.appendChild(newOptionItem);
        });

        updateRemoveOptionButtons(questionBlockElement); // Update button visibility after rendering
    }


    // Helper to update visibility of remove option buttons within a block
    function updateRemoveOptionButtons(questionBlockElement) {
        const optionsList = questionBlockElement.querySelector('.optionsList');
        if (!optionsList) return;
        const removeButtons = optionsList.querySelectorAll('.remove-option-btn');
        if (optionsList.children.length <= 1) {
            removeButtons.forEach(btn => btn.style.visibility = 'hidden');
        } else {
            removeButtons.forEach(btn => btn.style.visibility = 'visible');
        }
    }


    // Updates the answer section UI based on the selected question type and potentially pre-selected answer data
    function updateAnswerUI(questionBlockElement, answerData = null) {
        const type = questionBlockElement.querySelector('.questionType').value;
        const answerSection = questionBlockElement.querySelector('.answer-section');
        const optionsContainer = questionBlockElement.querySelector('.options-container');
        const questionBlockId = questionBlockElement.dataset.questionId;

        // Show/hide options container based on type
        optionsContainer.style.display = [QUESTION_TYPES.SINGLE, QUESTION_TYPES.MULTI_SELECT, QUESTION_TYPES.ORDERING].includes(type) ?
            'block' :
            'none';

        // Clear and rebuild the answer section HTML based on the type
        answerSection.innerHTML = ''; // Clear previous content

        const formGroup = document.createElement('div');
        formGroup.classList.add('form-group');

        if (type === QUESTION_TYPES.FILL_IN) {
            formGroup.innerHTML = `
                <label for="correctAnswer-${questionBlockId}" class="required"><i class="fas fa-check"></i> Correct Answer:</label>
                <input type="text" class="correctAnswer" id="correctAnswer-${questionBlockId}" placeholder="Enter the exact correct answer" value="${(answerData || '').replace(/"/g, '&quot;')}">
            `;
            answerSection.appendChild(formGroup);

        } else if (type === QUESTION_TYPES.SINGLE || type === QUESTION_TYPES.MULTI_SELECT) {
            const isMulti = type === QUESTION_TYPES.MULTI_SELECT;
            formGroup.innerHTML = `
                 <label class="required"><i class="fas fa-check-double"></i> Select ${isMulti ? 'All' : 'One'} Correct Answer${isMulti ? 's' : ''}:</label>
                 <div class="answerOptions" data-question-id="${questionBlockId}"></div>
            `;
            answerSection.appendChild(formGroup);
            // Immediately populate the answer options based on current option inputs and answerData
            renderAnswerOptions(questionBlockElement, answerData);

        } else if (type === QUESTION_TYPES.ORDERING) {
             formGroup.innerHTML = `
                 <label class="required"><i class="fas fa-sort-numeric-down"></i> Set Correct Order (Assign a number):</label>
                 <div class="order-options" data-question-id="${questionBlockId}"></div>
             `;
             answerSection.appendChild(formGroup);
             // Immediately populate and sort the order options based on current option inputs and answerData
             renderOrderOptions(questionBlockElement, answerData);
        }
    }


    // Renders the radio/checkbox options for single/multi-select answers
    function renderAnswerOptions(questionBlockElement, answerData = null) {
        const type = questionBlockElement.querySelector('.questionType').value;
        const answerContainer = questionBlockElement.querySelector('.answerOptions');
        if (!answerContainer) return;

        const isMulti = type === QUESTION_TYPES.MULTI_SELECT;
        const questionBlockId = questionBlockElement.dataset.questionId;

        // Get current, non-empty option values from the INPUT fields in the optionsContainer
        const options = Array.from(questionBlockElement.querySelectorAll('.optionsList .option-input'))
            .map(input => input.value.trim())
            .filter(v => v); // Only include non-empty options

        // Determine which options should be checked based on answerData
        const answersToCheck = Array.isArray(answerData) ? answerData.map(String) : (answerData !== null && answerData !== undefined ? [String(answerData)] : []);

        answerContainer.innerHTML = ''; // Clear existing answer options

        options.forEach((option) => {
            const div = document.createElement('div');
            // Create a unique ID for the input based on block ID and option text
            // Sanitize ID to remove problematic characters, limit length
            const inputId = `answer-${questionBlockId}-${option.replace(/[^a-zA-Z0-9_-]+/g, '').substring(0, 50)}`;
            const isChecked = answersToCheck.includes(option);

            const input = document.createElement('input');
            input.type = isMulti ? 'checkbox' : 'radio';
            input.id = inputId;
            input.name = `answer-${questionBlockId}`; // Use block ID for radio group name
            input.value = option.replace(/"/g, '&quot;');
            if (isChecked) {
                input.checked = true;
            }

            const label = document.createElement('label');
            label.htmlFor = inputId;
            label.textContent = option;

            div.appendChild(input);
            div.appendChild(label);
            answerContainer.appendChild(div);
        });
    }

    // Renders the list items with number inputs for ordering answers
    function renderOrderOptions(questionBlockElement, answerData = null) {
        const orderContainer = questionBlockElement.querySelector('.order-options');
        if (!orderContainer) return;

        const questionBlockId = questionBlockElement.dataset.questionId;

        // Get current, non-empty option values from the INPUT fields in the optionsContainer
        const options = Array.from(questionBlockElement.querySelectorAll('.optionsList .option-input'))
            .map(input => input.value.trim())
            .filter(v => v); // Only include non-empty options

        orderContainer.innerHTML = ''; // Clear existing order options

        // If answerData is provided (loading existing question) AND it's a valid array
        // AND its length matches the current valid options count, use it to determine initial order and values.
        // Otherwise, use the options list in its current order from the options input fields.
        const initialOrderItems = Array.isArray(answerData) && answerData.length === options.length
            ? answerData // Use answerData if it matches the number of options
            : options; // Otherwise, use the options list


        // Map the initial items to objects with value and a temporary order property
        const itemsWithOrder = initialOrderItems.map((value, index) => ({
            value: value,
            // Assign a temporary order based on the array index
            // If using answerData, this reflects the correct order 1, 2, 3...
            // If using options, this reflects the order they were listed in the input fields
            order: index + 1
        }));

        // Now create the DOM elements based on this temporary ordered list
        itemsWithOrder.forEach(item => {
            const div = document.createElement('div');

            const span = document.createElement('span');
            span.textContent = item.value.replace(/"/g, '&quot;');

            const input = document.createElement('input');
            input.type = 'number';
            input.classList.add('order-input');
            input.min = "1";
            input.max = options.length > 0 ? options.length : 1; // Max should be at least 1
            input.value = item.order;

            div.appendChild(span);
            div.appendChild(input);
            orderContainer.appendChild(div);
        });

        // After rendering, perform an initial sort based on the assigned 'order' values
        // This ensures the loaded correct order is displayed correctly initially
        sortOrderOptions(questionBlockElement);

        // Update the max attribute on all order inputs (in case options count changed)
        orderContainer.querySelectorAll('.order-input').forEach(input => {
             input.max = options.length > 0 ? options.length : 1; // Max should be at least 1
             // Ensure value is within bounds after max update
             input.value = Math.min(Math.max(parseInt(input.value) || 1, 1), parseInt(input.max));
        });
    }


    // Function to sort the ordering options visually based on their input values
    function sortOrderOptions(questionBlockElement) {
        const orderContainer = questionBlockElement.querySelector('.order-options');
        if (!orderContainer) return;

        const items = Array.from(orderContainer.children);
        items.sort((a, b) => {
            // Ensure parsing handles empty or non-numeric input gracefully
            const orderA = parseInt(a.querySelector('.order-input').value) || 0;
            const orderB = parseInt(b.querySelector('.order-input').value) || 0;
            return orderA - orderB;
        });

        // Use a DocumentFragment for efficient re-appending
        const fragment = document.createDocumentFragment();
        items.forEach(item => fragment.appendChild(item));
        orderContainer.appendChild(fragment);


         // Re-assign sequential numbers after sorting to fix duplicates/gaps visually
         // This loop operates on the items *after* they have been sorted and re-appended
         orderContainer.querySelectorAll('.order-options div').forEach((item, index) => {
             const input = item.querySelector('.order-input');
             input.value = index + 1;
             // Ensure max is correct after options might have changed
             input.max = orderContainer.children.length > 0 ? orderContainer.children.length : 1;
         });

         // Note: DataManager needs to be updated with the new order after sorting.
         // This will be handled by the general 'input' event listener in editor.js
         // calling getQuestionDataFromBlock and then DataManager.updateQuestion.
    }


    // Function to update the options in the preview select dropdown
    // Takes an array of question data objects and an optional ID to select
    // Returns the ID of the question that should now be selected/previewed
    function updatePreviewSelect(questionsData, selectedQuestionId = null) {
        const currentSelectedId = DOM.previewQuestionSelect.value;
        // Prioritize selectedQuestionId if provided, otherwise keep current, else null
        let newSelectionId = selectedQuestionId !== null ? selectedQuestionId : currentSelectedId;

        // Clear existing options
        DOM.previewQuestionSelect.innerHTML = '';

        if (!questionsData || questionsData.length === 0) {
            // No questions, add a disabled option
            DOM.previewQuestionSelect.add(new Option("No questions available", "", false, true));
            DOM.previewQuestionSelect.disabled = true;
            DOM.questionPreviewArea.innerHTML = '<p style="text-align: center; color: var(--text-light);">Add questions above to enable preview.</p>';
            return null; // Indicate no question is selected
        } else {
            DOM.previewQuestionSelect.disabled = false;
            questionsData.forEach((q, index) => {
                const blockId = q.id;
                const optionText = `Question #${index + 1}`;
                const option = new Option(optionText, blockId);
                DOM.previewQuestionSelect.add(option);

                // If this is the ID we want to select, mark it
                if (newSelectionId === blockId) {
                     option.selected = true;
                }
            });

            // If after adding/removing, the previously selected ID is no longer in the list,
            // or if nothing was selected initially, select the first question.
            const selectedOption = DOM.previewQuestionSelect.querySelector('option:checked');
            if (!selectedOption && questionsData.length > 0) {
                DOM.previewQuestionSelect.value = questionsData[0].id;
                 newSelectionId = questionsData[0].id; // Update newSelectionId
            } else if (selectedOption) {
                 newSelectionId = selectedOption.value; // Ensure newSelectionId is the currently selected one
            } else {
                 newSelectionId = null; // Should not happen if questionsData.length > 0
            }
        }
        // Return the ID of the question that should now be previewed by editor.js
        return newSelectionId;
    }


    // Function to update the enabled/disabled state of the save button
    function updateSaveButtonState(isValid) {
        DOM.saveQuestionsBtn.disabled = !isValid;
    }

    // Public API
    return {
        DOM, // Expose DOM elements for editor.js to attach listeners
        getQuestionDataFromBlock, // Expose function to read UI state
        renderQuestionBlock,
        removeQuestionBlock,
        renderOptionInputs, // Exposed in case editor.js needs to specifically re-render options
        updateAnswerUI, // Exposed in case editor.js needs to specifically re-render answer section (type change)
        renderAnswerOptions, // Exposed if needed (option text change for single/multi)
        renderOrderOptions, // Exposed if needed (option text change for ordering)
        sortOrderOptions, // Exposed if editor.js needs to trigger sort directly
        updateRemoveOptionButtons, // Exposed if editor.js needs to trigger button visibility directly
        updatePreviewSelect,
        updateSaveButtonState,
    };
})();
