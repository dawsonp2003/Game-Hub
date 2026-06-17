import { supabase } from '../supabase/client'
import type { LetterResult } from '../words'

export async function submitAsyncSecret(matchId: string, secret: string): Promise<boolean> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('submit_async_secret', {
    p_match_id: matchId,
    p_secret: secret,
  })
  if (error) throw error
  return data as boolean
}

export interface WordGuessScoreResult {
  guess: string
  results: LetterResult[]
  won: boolean
  lost: boolean
  reveal: string | null
  guessCount: number
}

export async function scoreAsyncWordGuess(
  matchId: string,
  guess: string,
): Promise<WordGuessScoreResult> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('score_async_word_guess', {
    p_match_id: matchId,
    p_guess: guess,
  })
  if (error) throw error
  const row = data as {
    guess: string
    results: LetterResult[]
    won: boolean
    lost: boolean
    reveal: string | null
    guessCount: number
  }
  return row
}

export interface HangmanScoreResult {
  letter: string
  guessed: string[]
  wrongCount: number
  won: boolean
  lost: boolean
  display: string
  reveal: string | null
}

export async function scoreAsyncHangmanGuess(
  matchId: string,
  letter: string,
): Promise<HangmanScoreResult> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('score_async_hangman_guess', {
    p_match_id: matchId,
    p_letter: letter,
  })
  if (error) throw error
  return data as HangmanScoreResult
}
