import type { ComputerOptionsConfig } from '../../lib/computer-options'

export const ultimateTicTacToeComputerOptions: ComputerOptionsConfig = {
  title: 'Computer opponent',
  subtitle: 'Choose how tough the AI plays.',
  fields: [
    {
      id: 'difficulty',
      label: 'Difficulty',
      choices: [
        { value: 'easy', label: 'Easy', description: 'Random legal moves' },
        { value: 'normal', label: 'Normal', description: 'Smart heuristics and basic tactics' },
        { value: 'hard', label: 'Hard', description: 'Looks ahead and punishes mistakes' },
      ],
      default: 'normal',
    },
  ],
}
