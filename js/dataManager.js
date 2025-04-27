// js/dataManager.js

// This module manages the internal array of question objects.
// It provides functions to add, remove, get, and update questions.
// It does NOT interact with the DOM or handle validation.

const DataManager = (function() {

    let questions = []; // Array to hold question objects

    // Private counter for unique question IDs
    // This counter is used to generate the *next* available ID.
    // When loading existing data, this counter is reset based on the max existing ID.
    let questionIdCounter = 0;

    // Function to generate a new unique ID string
    // This is now the primary way to get a new ID for a question object
    // It increments the internal counter and returns the new ID.
    function generateNewId() {
        questionIdCounter++;
        return `q_${questionIdCounter}`;
    }


    // Function to add a new question object to the array
    // Assumes the questionData object is well-formed (e.g., from editor.js)
    // It expects the questionData to *already have* a unique ID assigned (e.g., via generateNewId)
    function addQuestion(questionData) {
        // Ensure the questionData has an ID before adding
        if (!questionData.id) {
             console.error("DataManager.addQuestion: Received question data without an ID. Cannot add.", questionData);
             return null; // Indicate failure
        }

        // Check if a question with this ID already exists to avoid duplicates
        // This check is mainly useful during development or if unexpected data is passed.
        // The standard workflow (addQuestion() in editor.js) uses generateNewId first.
        const existingIndex = questions.findIndex(q => q.id === questionData.id);
        if (existingIndex !== -1) {
            console.warn(`DataManager.addQuestion: Question with ID ${questionData.id} already exists. Replacing.`);
            questions[existingIndex] = questionData; // Option to replace
        } else {
            questions.push(questionData);
        }

        // When adding a question, ensure the counter is at least as high as the ID added,
        // in case questions were added out of sequence or with manually set IDs.
        const match = String(questionData.id).match(/^q_(\\d+)$/);
        if (match) {
             const idNumber = parseInt(match[1]);
             if (!isNaN(idNumber) && idNumber > questionIdCounter) {
                 questionIdCounter = idNumber;
                  console.warn(`DataManager: Adjusted counter up to ${questionIdCounter} based on added question ID.`);
             }
        }


        return questionData.id; // Return the ID of the added question
    }

    // Function to remove a question by its ID
    function removeQuestion(questionId) {
        const initialLength = questions.length;
        questions = questions.filter(q => q.id !== questionId);
        return questions.length < initialLength; // Return true if a question was removed
    }

    // Function to get all questions
    function getAllQuestions() {
        // Return a copy to prevent external modification of the internal array
        // This is important if other modules might try to modify the array directly
        return JSON.parse(JSON.stringify(questions)); // Deep copy
    }

    // Function to get a single question by ID
    function getQuestionById(questionId) {
        // Return a copy of the object to prevent external modification
        const question = questions.find(q => q.id === questionId);
        return question ? JSON.parse(JSON.stringify(question)) : undefined; // Deep copy
    }

    // Function to update a question by ID
    // This function takes updated data and replaces the existing object
    function updateQuestion(questionId, updatedData) {
        const questionIndex = questions.findIndex(q => q.id === questionId);
        if (questionIndex !== -1) {
            // Ensure the ID isn't accidentally changed during update
            if (updatedData.id !== questionId) {
                 console.warn(`DataManager.updateQuestion: Attempted to change question ID from ${questionId} to ${updatedData.id}. ID change prevented.`);
                 updatedData.id = questionId; // Force the ID to match
            }
            questions[questionIndex] = updatedData;
            return true; // Return true if updated
        }        console.warn(`DataManager.updateQuestion: Question with ID ${questionId} not found.`);
        return false; // Return false if question not found
    }

    // Function to set all questions (e.g., when loading from a file or localStorage)
    function setAllQuestions(newQuestionsArray) {
        questions = Array.isArray(newQuestionsArray) ? JSON.parse(JSON.stringify(newQuestionsArray)) : []; // Deep copy

        // Reset the counter based on the maximum ID number found in the loaded questions
        // This ensures that newly generated IDs won't conflict with loaded ones.
        questionIdCounter = questions.reduce((max, q) => {
             const match = q && q.id ? String(q.id).match(/^q_(\\d+)$/) : null;
             const idNumber = match ? parseInt(match[1]) : 0;
             return !isNaN(idNumber) ? Math.max(max, idNumber) : max;
        }, 0);

         console.log(`DataManager: Set ${questions.length} questions. Counter reset to ${questionIdCounter}.`);
    }

    // Public API
    return {
        generateNewId, // Expose the function to generate new IDs
        addQuestion,
        removeQuestion,
        getAllQuestions,
        getQuestionById,
        updateQuestion,
        setAllQuestions
    };
})();
