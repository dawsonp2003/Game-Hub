import type { ComputerOptionsConfig } from '../../lib/computer-options'

export const ticTacToeComputerOptions: ComputerOptionsConfig = {
  title: 'Computer opponent',
  subtitle: 'Choose how tough the AI plays.',
  fields: [
    {
      id: 'difficulty',
      label: 'Difficulty',
      choices: [
        { value: 'easy', label: 'Easy', description: 'Mostly random moves' },
        { value: 'medium', label: 'Medium', description: 'Blocks and takes obvious wins' },
        { value: 'hard', label: 'Hard', description: 'Perfect play — unwinnable if you slip' },
      ],
      default: 'hard',
    },
  ],
}
