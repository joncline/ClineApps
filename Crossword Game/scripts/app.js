import { crosswordSets } from './crossword-data.js';

// Wait for the DOM to fully load before running the script
document.addEventListener('DOMContentLoaded', () => {
    // Get references to the crossword board and control buttons
    const crosswordBoard = document.getElementById('crossword-board');
    const checkAnswersButton = document.getElementById('check-answers');
    const getHintButton = document.getElementById('get-hint');
    const resetPuzzleButton = document.getElementById('reset-puzzle');
    const puzzleSelect = document.getElementById('puzzle-select');

    // Calculate starting position to align with the board
    const centerX = 2;
    const centerY = 2;

    // Track current puzzle data
    let currentPuzzleData;

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
    function initializeBoard(puzzleKey = 'salesforce') {
        // Get the puzzle data
        currentPuzzleData = crosswordSets[puzzleKey].data;

        // Clear the board
        crosswordBoard.innerHTML = '';

        // Get references to clue lists
        const acrossClues = document.getElementById('across-clues');
        const downClues = document.getElementById('down-clues');
        
        // Clear existing clues
        acrossClues.innerHTML = '';
        downClues.innerHTML = '';

        // First pass: assign numbers to cells that start words
        let cellNumbers = new Map();
        let nextNumber = 1;
        
        currentPuzzleData.forEach(entry => {
            const key = `${centerY + entry.row},${centerX + entry.col}`;
            if (!cellNumbers.has(key)) {
                cellNumbers.set(key, nextNumber++);
            }
        });

        // Populate the clues sections
        currentPuzzleData.forEach(entry => {
            const clueItem = document.createElement('li');
            const cellKey = `${centerY + entry.row},${centerX + entry.col}`;
            const number = cellNumbers.get(cellKey);
            const clueText = document.createTextNode(`${number}. ${entry.clue}`);
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
                const cellKey = `${y},${x}`;
                const number = i === 0 ? cellNumbers.get(cellKey) : null;
                const cell = createCell(x, y, number);
                cell.dataset.row = y;
                cell.dataset.col = x;
                crosswordBoard.appendChild(cell);
            }
        });
    }

    // Function to check user answers
    function checkAnswers() {
        let allCorrect = true;
        currentPuzzleData.forEach(entry => {
            const word = entry.word.toUpperCase();
            for (let i = 0; i < word.length; i++) {
                const x = centerX + entry.col + (entry.direction === 'across' ? i : 0);
                const y = centerY + entry.row + (entry.direction === 'down' ? i : 0);
                const cell = document.querySelector(`[data-row="${y}"][data-col="${x}"]`);
                if (cell) {
                    const userInput = cell.textContent.toUpperCase();
                    if (userInput !== word[i]) {
                        allCorrect = false;
                        cell.style.color = 'red';
                    } else {
                        cell.style.color = 'green';
                    }
                }
            }
        });
        
        if (allCorrect) {
            alert('Congratulations! All answers are correct!');
        }
    }

    // Function to provide a hint
    function getHint() {
        // Get all empty or incorrect cells
        const emptyCells = [];
        currentPuzzleData.forEach(entry => {
            const word = entry.word.toUpperCase();
            for (let i = 0; i < word.length; i++) {
                const x = centerX + entry.col + (entry.direction === 'across' ? i : 0);
                const y = centerY + entry.row + (entry.direction === 'down' ? i : 0);
                const cell = document.querySelector(`[data-row="${y}"][data-col="${x}"]`);
                if (cell && (!cell.textContent || cell.style.color === 'red')) {
                    emptyCells.push({ cell, correctLetter: word[i] });
                }
            }
        });

        if (emptyCells.length > 0) {
            // Randomly select one empty cell and fill it
            const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            randomCell.cell.textContent = randomCell.correctLetter;
            randomCell.cell.style.color = 'blue';
        } else {
            alert('No empty cells left! Try checking your answers.');
        }
    }

    // Function to reset the puzzle
    function resetPuzzle() {
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.textContent = '';
            cell.style.color = 'black';
        });
    }

    // Add event listeners to the control buttons
    checkAnswersButton.addEventListener('click', checkAnswers);
    getHintButton.addEventListener('click', getHint);
    resetPuzzleButton.addEventListener('click', resetPuzzle);
    // Function to switch puzzles
    function switchPuzzle(puzzleKey) {
        puzzleSelect.value = puzzleKey;
        initializeBoard(puzzleKey);
    }

    // Add event listener for puzzle selection
    puzzleSelect.addEventListener('change', (e) => {
        switchPuzzle(e.target.value);
    });

    // Initialize the game by setting up the board with the default puzzle
    switchPuzzle('salesforce');
});
