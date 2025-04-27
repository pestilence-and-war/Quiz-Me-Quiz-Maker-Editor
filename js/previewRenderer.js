// js/previewRenderer.js

// This module contains the logic to render a static preview of a question object.
// It takes a question data object and a target DOM element, and renders the preview.
// It does NOT interact with editor input fields or validation.

const PreviewRenderer = (function() {

    // Define question types used for rendering logic
    const QUESTION_TYPES = {
        SINGLE: 'single',
        MULTI_SELECT: 'multi-select',
        FILL_IN: 'fill-in',
        ORDERING: 'ordering'
    };

    // Relevant CSS classes from the Quiz Me app for preview styling
    const CSS_CLASSES = {
        CORRECT: 'correct',
        INCORRECT: 'incorrect', // Used for visual cues in preview if needed (e.g., missing ordering item)
        FILL_IN_INPUT: 'fill-in-input',
        DRAGGABLE: 'draggable', // Used for styling, not actual drag functionality
        INSTRUCTIONS: 'instructions',
        HINT_ICON: 'hint-icon',
        OPTIONS_CONTAINER: 'options', // The container for option elements
        OPTION: 'option', // Individual option elements
        CORRECT_ANSWER_FEEDBACK: 'correct-answer-feedback' // Class for fill-in answer feedback
    };

    // Map question types to their specific rendering functions for options/answers
    const questionPreviewRenderers = {
        [QUESTION_TYPES.SINGLE]: renderSingleChoicePreview,
        [QUESTION_TYPES.MULTI_SELECT]: renderMultiSelectPreview,
        [QUESTION_TYPES.FILL_IN]: renderFillInPreview,
        [QUESTION_TYPES.ORDERING]: renderOrderingPreview
    };

    // Helper to create a basic option element for the preview
    function createOptionElementPreview(text, index) {
        const optElement = document.createElement('div');
        optElement.classList.add(CSS_CLASSES.OPTION); // Use the quiz app's option class
        optElement.textContent = text;
        // Add data attributes for consistency, though not used for interaction here
        optElement.dataset.index = index;
        optElement.dataset.value = text;
        return optElement;
    }

    // Renders options for Single Answer preview
    function renderSingleChoicePreview(questionObject, container) {
        // Ensure Options array exists and has items
        if (!questionObject.Options || !Array.isArray(questionObject.Options) || questionObject.Options.length === 0) {
            container.innerHTML += `<p style="color:var(--danger);">Preview Error: Options missing or invalid.</p>`;
            return false;
        }
        const optionsDiv = document.createElement('div');
        optionsDiv.classList.add(CSS_CLASSES.OPTIONS_CONTAINER); // Use the quiz app's options container class
        container.appendChild(optionsDiv);

        const correctAnswer = String(questionObject.answer); // Ensure answer is a string for comparison

        questionObject.Options.forEach((option, index) => {
            const optElement = createOptionElementPreview(String(option), index); // Ensure option is a string
            // Highlight the correct answer
            if (String(option) === correctAnswer) {
                optElement.classList.add(CSS_CLASSES.CORRECT);
            }
            optionsDiv.appendChild(optElement);
        });
        return true;
    }

    // Renders input and feedback for Fill in the Blank preview
    function renderFillInPreview(questionObject, container) {
        const inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.classList.add(CSS_CLASSES.FILL_IN_INPUT); // Use the quiz app's input class
        inputElement.placeholder = 'Enter your answer';
        inputElement.disabled = true; // Make it non-interactive in preview
        // Optionally set a value if you want to show the correct answer inside the box
        // inputElement.value = questionObject.answer || ''; // Or show placeholder
        container.appendChild(inputElement);

        // Show the correct answer below the input
        const feedbackText = document.createElement('p');
        feedbackText.classList.add(CSS_CLASSES.CORRECT_ANSWER_FEEDBACK); // Use a class for styling feedback
        feedbackText.textContent = `Correct Answer: ${questionObject.answer || '[No answer set]'}`;
        container.appendChild(feedbackText);

        return true;
    }

    // Renders options for Multiple Answers preview
    function renderMultiSelectPreview(questionObject, container) {
        // Ensure Options array exists and has items
        if (!questionObject.Options || !Array.isArray(questionObject.Options) || questionObject.Options.length === 0) {
            container.innerHTML += `<p style="color:var(--danger);">Preview Error: Options missing or invalid.</p>`;
            return false;
        }
        const optionsDiv = document.createElement('div');
        optionsDiv.classList.add(CSS_CLASSES.OPTIONS_CONTAINER); // Use the quiz app's options container class
        container.appendChild(optionsDiv);

        // Ensure answer is an array of strings for comparison
        const correctAnswersArray = Array.isArray(questionObject.answer) ? questionObject.answer.map(String) : (questionObject.answer !== null && questionObject.answer !== undefined ? [String(questionObject.answer)] : []);

        questionObject.Options.forEach((option, index) => {
            const optElement = createOptionElementPreview(String(option), index); // Ensure option is a string
            // Highlight correct answers
            if (correctAnswersArray.includes(String(option))) {
                optElement.classList.add(CSS_CLASSES.CORRECT);
            }
            // In multi-select preview, we could potentially show what a user MIGHT select,
            // but just highlighting correct is clearer for editor preview.
            optionsDiv.appendChild(optElement);
        });
        return true;
    }

    // Renders options in the correct order for Ordering preview
    function renderOrderingPreview(questionObject, container) {
        // For preview, we need to render the options in the CORRECT order
        // The questionObject.answer property should be an array of the options in the correct sequence.
        // questionObject.Options is just the list of available items.
        if (!questionObject.Options || !Array.isArray(questionObject.Options) || questionObject.Options.length === 0 || !questionObject.answer || !Array.isArray(questionObject.answer) || questionObject.answer.length === 0) {
            container.innerHTML += `<p style="color:var(--danger);">Preview Error: Options or Answer missing/invalid for Ordering.</p>`;
            return false;
        }

        const optionsDiv = document.createElement('div');
        optionsDiv.classList.add(CSS_CLASSES.OPTIONS_CONTAINER); // Use the options class for styling
        container.appendChild(optionsDiv);

        const correctOrderArray = questionObject.answer.map(String); // Ensure answer items are strings
        const availableOptions = questionObject.Options.map(String); // Ensure options are strings

        // Create option elements for all options present in the CORRECT answer order
        const orderedElements = correctOrderArray.map((correctText, index) => {
             // Check if this correct answer text exists in the available options list
             if (!availableOptions.includes(correctText)) {
                  console.warn(`Preview Warning: Option text "${correctText}" from answer not found in available options list.`);
                  // Create a placeholder for missing items in the answer sequence
                  const placeholder = document.createElement('div');
                  placeholder.classList.add(CSS_CLASSES.OPTION, CSS_CLASSES.INCORRECT); // Use option class and indicate issue
                  placeholder.textContent = `[Missing: ${correctText}]`;
                   // Prepend the order number for clarity on missing items too
                  placeholder.innerHTML = `<strong>${index + 1}.</strong> ${placeholder.innerHTML}`;
                  return placeholder;
             }
             // Create the element if the option text is valid and found in options
             const optElement = createOptionElementPreview(correctText, index);
             optElement.classList.add(CSS_CLASSES.DRAGGABLE); // Add draggable class for styling (visual only)
             optElement.classList.add(CSS_CLASSES.CORRECT); // Mark items in the correct order as correct

             // Prepend the order number for clarity in the preview
             optElement.innerHTML = `<strong>${index + 1}.</strong> ${optElement.innerHTML}`;

             return optElement;

        }).filter(el => el); // Filter out any potential null/undefined results

        // Append the elements in the correct order
        orderedElements.forEach(el => optionsDiv.appendChild(el));

        // Note: If q.Options contains items *not* in q.answer, they are simply not displayed in this ordered preview.
        // This is acceptable for previewing the *correct* order.
        // If q.answer contains items not in q.Options, placeholders were added above.

        return true;
    }


    // Main function to render a question preview into a target container
    // Takes a question data object and the target DOM element.
    function renderPreview(questionObject, previewContainerElement) {
        previewContainerElement.innerHTML = ''; // Clear previous preview

        // Basic check for valid question data object
        if (!questionObject || typeof questionObject !== 'object' || !questionObject.Question) {
            previewContainerElement.innerHTML = '<p style="text-align: center; color: var(--text-light);">Invalid question data for preview.</p>';
            return;
        }

        const questionType = questionObject.type || QUESTION_TYPES.SINGLE;

        // Add Question Text and Hint container
        const questionAreaDiv = document.createElement('div');
        questionAreaDiv.classList.add('question-area'); // Use the quiz app's question area class
        previewContainerElement.appendChild(questionAreaDiv);

        const questionTextDiv = document.createElement('div');
        questionTextDiv.classList.add('question'); // Use the quiz app's question text class
        questionTextDiv.innerHTML = questionObject.Question; // Use innerHTML to support basic formatting if needed
        questionAreaDiv.appendChild(questionTextDiv);

        // Add Hint icon and tooltip
        const hintIconDiv = document.createElement('div');
        hintIconDiv.classList.add(CSS_CLASSES.HINT_ICON); // Use the quiz app's hint icon class
        const hasValidHint = questionObject.hint && questionObject.hint.trim() !== "" && questionObject.hint.trim().toLowerCase() !== "no hint available." && questionObject.hint.trim().toLowerCase() !== "no hint.";
        hintIconDiv.style.display = hasValidHint ? 'inline-block' : 'none'; // Hide if no valid hint
        hintIconDiv.dataset.hint = hasValidHint ? questionObject.hint : ""; // Set hint text for tooltip
        hintIconDiv.innerHTML = '<i class="fas fa-info-circle"></i>'; // Use font-awesome icon
        questionAreaDiv.appendChild(hintIconDiv);


        // Add Instructions
        const instructionsP = document.createElement('p');
        instructionsP.classList.add(CSS_CLASSES.INSTRUCTIONS); // Use the quiz app's instructions class
        instructionsP.style.display = 'block'; // Always show instructions in preview for clarity
        if (questionType === QUESTION_TYPES.SINGLE) instructionsP.textContent = 'Select the single correct answer.';
        else if (questionType === QUESTION_TYPES.MULTI_SELECT) instructionsP.textContent = 'Select all options that apply.';
        else if (questionType === QUESTION_TYPES.FILL_IN) instructionsP.textContent = 'Type your answer in the box.';
        else if (questionType === QUESTION_TYPES.ORDERING) instructionsP.textContent = 'Drag and drop the items to put them in the correct order.';
        else instructionsP.style.display = 'none'; // Hide if no specific instructions

        previewContainerElement.appendChild(instructionsP);


        // Render Options/Input based on type using the specific renderer
        const renderFunc = questionPreviewRenderers[questionType];
        if (renderFunc) {
            // Pass the question data object and the main container for options/input
            renderFunc(questionObject, previewContainerElement);
        } else {
            previewContainerElement.innerHTML += `<p style="color:var(--danger);">Preview Error: Unknown question type "${questionType}".</p>`;
        }
    }

    // Public API
    return {
        renderPreview
    };
})();
