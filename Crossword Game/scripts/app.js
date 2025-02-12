// Wait for the DOM to fully load before running the script
document.addEventListener('DOMContentLoaded', () => {
    // Get references to the crossword board and control buttons
    const crosswordBoard = document.getElementById('crossword-board');
    const checkAnswersButton = document.getElementById('check-answers');
    const getHintButton = document.getElementById('get-hint');
    const resetPuzzleButton = document.getElementById('reset-puzzle');

    // Crossword data with words related to Salesforce AgentForce and AI
    const clueList = document.getElementById('clue-list'); // Reference to the clue list in HTML
    const crosswordData = [
        { word: 'salesforce', row: 0, col: 0, direction: 'across', clue: 'A cloud-based software company', hint: 'Think CRM giant founded by Marc Benioff' },
        { word: 'agent', row: 1, col: 0, direction: 'down', clue: 'A representative or advocate', hint: 'Someone who acts on behalf of another' },
        { word: 'learn', row: 1, col: 3, direction: 'across', clue: 'To acquire knowledge or skill', hint: 'What AI models do with training data' },
        { word: 'neural', row: 3, col: 3, direction: 'across', clue: 'Relating to a nerve or the nervous system', hint: 'Type of network inspired by brain structure' },
        { word: 'ai', row: 1, col: 5, direction: 'down', clue: 'Artificial Intelligence', hint: 'Machine learning and cognitive computing' },
        { word: 'data', row: 5, col: 0, direction: 'across', clue: 'Facts and statistics collected for reference', hint: 'Information in digital form' },
        { word: 'train', row: 3, col: 7, direction: 'down', clue: 'To teach a person or animal a skill', hint: 'Process of teaching an AI model' },
        { word: 'network', row: 7, col: 0, direction: 'across', clue: 'A group of interconnected people or things', hint: 'Connected systems working together' },
        { word: 'cloud', row: 5, col: 5, direction: 'down', clue: 'Type of computing that relies on shared resources', hint: 'Remote servers and storage' },
        { word: 'force', row: 7, col: 3, direction: 'down', clue: 'A push or pull on an object', hint: 'Power or influence over something' },
        { word: 'model', row: 9, col: 0, direction: 'across', clue: 'A representation of a system or process', hint: 'Framework that makes predictions' },
        { word: 'predict', row: 9, col: 5, direction: 'across', clue: 'To declare or indicate in advance', hint: 'Forecast future outcomes' },
        { word: 'bot', row: 7, col: 7, direction: 'down', clue: 'Automated program that runs over the internet', hint: 'Software robot that performs tasks' },
        { word: 'sales', row: 11, col: 2, direction: 'across', clue: 'Transactions of goods or services', hint: 'Revenue-generating activities' }
    ];

    // Function to create a cell
    function createCell(x, y, number = null) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.contentEditable = true;
        cell.style.left = `${x * 40}px`;
        cell.style.top = `${y * 40}px`;
        
        if (number) {
            const numberDiv = document.createElement('div');
            numberDiv.className = 'cell-number';
            numberDiv.textContent = number;
            cell.appendChild(numberDiv);
        }

        // Handle input to limit to single character, auto-uppercase, and move to next cell
        cell.addEventListener('input', (e) => {
            if (e.target.textContent.length > 1) {
                e.target.textContent = e.target.textContent.charAt(0).toUpperCase();
                // Find and focus next cell in the same row
                const currentRow = parseInt(e.target.dataset.row);
                const currentCol = parseInt(e.target.dataset.col);
                const nextCell = document.querySelector(`[data-row="${currentRow}"][data-col="${currentCol + 1}"]`);
                if (nextCell) {
                    nextCell.focus();
                }
            }
        });

        // Handle keyboard navigation and backspace
        cell.addEventListener('keydown', (e) => {
            const currentRow = parseInt(e.target.dataset.row);
            const currentCol = parseInt(e.target.dataset.col);
            let nextCell;

            switch (e.key) {
                case 'ArrowRight':
                    nextCell = document.querySelector(`[data-row="${currentRow}"][data-col="${currentCol + 1}"]`);
                    break;
                case 'ArrowLeft':
                    nextCell = document.querySelector(`[data-row="${currentRow}"][data-col="${currentCol - 1}"]`);
                    break;
                case 'ArrowUp':
                    nextCell = document.querySelector(`[data-row="${currentRow - 1}"][data-col="${currentCol}"]`);
                    break;
                case 'ArrowDown':
                    nextCell = document.querySelector(`[data-row="${currentRow + 1}"][data-col="${currentCol}"]`);
                    break;
                case 'Backspace':
                    if (e.target.textContent === '') {
                        nextCell = document.querySelector(`[data-row="${currentRow}"][data-col="${currentCol - 1}"]`);
                        if (nextCell) {
                            e.preventDefault();
                            nextCell.focus();
                            nextCell.textContent = '';
                        }
                    }
                    break;
            }

            if (nextCell && e.key.startsWith('Arrow')) {
                e.preventDefault(); // Prevent default arrow key behavior
                nextCell.focus();
            }
        });

        return cell;
    }

    // Function to initialize the crossword board
    function initializeBoard() {
        // Clear the board
        crosswordBoard.innerHTML = '';

        // Calculate starting position to align with the board
        const centerX = 2;
        const centerY = 2;

        // Get references to clue lists
        const acrossClues = document.getElementById('across-clues');
        const downClues = document.getElementById('down-clues');
        
        // Clear existing clues
        acrossClues.innerHTML = '';
        downClues.innerHTML = '';

        // Populate the clues sections
        crosswordData.forEach((entry, index) => {
            const clueItem = document.createElement('li');
            const clueText = document.createTextNode(`${index + 1}. ${entry.clue}`);
            clueItem.appendChild(clueText);

            // Create help bubble
            const helpBubble = document.createElement('div');
            helpBubble.className = 'help-bubble';
            helpBubble.textContent = '?';
            helpBubble.setAttribute('data-hint', entry.hint);
            // Add position class for tooltips
            if (entry.direction === 'down') {
                helpBubble.classList.add('tooltip-left');
            }
            clueItem.appendChild(helpBubble);
            
            if (entry.direction === 'across') {
                acrossClues.appendChild(clueItem);
            } else {
                downClues.appendChild(clueItem);
            }

            // Create cells for each word
            const startX = centerX + entry.col;
            const startY = centerY + entry.row;

            for (let i = 0; i < entry.word.length; i++) {
                const x = startX + (entry.direction === 'across' ? i : 0);
                const y = startY + (entry.direction === 'down' ? i : 0);
                
                // Only add cell number to first letter of the word
                const number = i === 0 ? (index + 1) : null;
                const cell = createCell(x, y, number);
                cell.dataset.row = y;
                cell.dataset.col = x;
                crosswordBoard.appendChild(cell);
            }
        });
    }

    // Function to check user answers
    function checkAnswers() {
        // Logic to check user input against correct answers
        alert('Checking answers...');
    }

    // Function to provide a hint
    function getHint() {
        // Logic to provide a hint
        alert('Getting a hint...');
    }

    // Function to reset the puzzle
    function resetPuzzle() {
        // Logic to reset the puzzle
        alert('Resetting puzzle...');
    }

    // Add event listeners to the control buttons
    checkAnswersButton.addEventListener('click', checkAnswers);
    getHintButton.addEventListener('click', getHint);
    resetPuzzleButton.addEventListener('click', resetPuzzle);

    // Initialize the game by setting up the board
    initializeBoard();
});
