export interface TierPresetItem {
  label: string
  wikiTitle: string
}

export interface TierPreset {
  id: string
  title: string
  description: string
  items: TierPresetItem[]
}

export const TIER_PRESETS: TierPreset[] = [
  {
    id: 'pokemon-starters',
    title: 'Pokémon starters',
    description: 'Classic starter Pokémon from each generation.',
    items: [
      { label: 'Bulbasaur', wikiTitle: 'Bulbasaur' },
      { label: 'Charmander', wikiTitle: 'Charmander' },
      { label: 'Squirtle', wikiTitle: 'Squirtle' },
      { label: 'Chikorita', wikiTitle: 'Chikorita' },
      { label: 'Cyndaquil', wikiTitle: 'Cyndaquil' },
      { label: 'Totodile', wikiTitle: 'Totodile' },
      { label: 'Treecko', wikiTitle: 'Treecko' },
      { label: 'Torchic', wikiTitle: 'Torchic' },
      { label: 'Mudkip', wikiTitle: 'Mudkip' },
      { label: 'Turtwig', wikiTitle: 'Turtwig' },
      { label: 'Chimchar', wikiTitle: 'Chimchar' },
      { label: 'Piplup', wikiTitle: 'Piplup' },
    ],
  },
  {
    id: 'mario-characters',
    title: 'Mario characters',
    description: 'Iconic characters from the Mario universe.',
    items: [
      { label: 'Mario', wikiTitle: 'Mario' },
      { label: 'Luigi', wikiTitle: 'Luigi (character)' },
      { label: 'Princess Peach', wikiTitle: 'Princess Peach' },
      { label: 'Bowser', wikiTitle: 'Bowser' },
      { label: 'Yoshi', wikiTitle: 'Yoshi' },
      { label: 'Toad', wikiTitle: 'Toad (Nintendo)' },
      { label: 'Wario', wikiTitle: 'Wario' },
      { label: 'Waluigi', wikiTitle: 'Waluigi' },
      { label: 'Donkey Kong', wikiTitle: 'Donkey Kong' },
      { label: 'Rosalina', wikiTitle: 'Rosalina' },
    ],
  },
  {
    id: 'fast-food',
    title: 'Fast food chains',
    description: 'Popular fast food restaurants in the US.',
    items: [
      { label: "McDonald's", wikiTitle: "McDonald's" },
      { label: 'Burger King', wikiTitle: 'Burger King' },
      { label: 'Wendy\'s', wikiTitle: "Wendy's" },
      { label: 'Taco Bell', wikiTitle: 'Taco Bell' },
      { label: 'KFC', wikiTitle: 'KFC' },
      { label: 'Subway', wikiTitle: 'Subway (restaurant)' },
      { label: 'Chick-fil-A', wikiTitle: 'Chick-fil-A' },
      { label: 'Five Guys', wikiTitle: 'Five Guys' },
      { label: 'In-N-Out Burger', wikiTitle: 'In-N-Out Burger' },
      { label: 'Chipotle', wikiTitle: 'Chipotle Mexican Grill' },
    ],
  },
  {
    id: 'superheroes',
    title: 'Superheroes',
    description: 'Well-known superheroes from comics and film.',
    items: [
      { label: 'Superman', wikiTitle: 'Superman' },
      { label: 'Batman', wikiTitle: 'Batman' },
      { label: 'Spider-Man', wikiTitle: 'Spider-Man' },
      { label: 'Wonder Woman', wikiTitle: 'Wonder Woman' },
      { label: 'Iron Man', wikiTitle: 'Iron Man' },
      { label: 'Captain America', wikiTitle: 'Captain America' },
      { label: 'Thor', wikiTitle: 'Thor (Marvel Comics)' },
      { label: 'Hulk', wikiTitle: 'Hulk' },
      { label: 'Black Panther', wikiTitle: 'Black Panther (character)' },
      { label: 'Wolverine', wikiTitle: 'Wolverine (character)' },
    ],
  },
  {
    id: 'pixar-films',
    title: 'Pixar films',
    description: 'Beloved Pixar animated movies.',
    items: [
      { label: 'Toy Story', wikiTitle: 'Toy Story' },
      { label: 'Finding Nemo', wikiTitle: 'Finding Nemo' },
      { label: 'The Incredibles', wikiTitle: 'The Incredibles' },
      { label: 'Up', wikiTitle: 'Up (2009 film)' },
      { label: 'WALL-E', wikiTitle: 'WALL-E' },
      { label: 'Inside Out', wikiTitle: 'Inside Out (2015 film)' },
      { label: 'Coco', wikiTitle: 'Coco (2017 film)' },
      { label: 'Monsters, Inc.', wikiTitle: 'Monsters, Inc.' },
      { label: 'Ratatouille', wikiTitle: 'Ratatouille (film)' },
      { label: 'Cars', wikiTitle: 'Cars (film)' },
    ],
  },
]
