'use client';

import { useState, useEffect } from 'react';

type DayPart = 'manana' | 'tarde' | 'noche';

interface GreetingSet {
  time: string[];
  generic: string[];
}

const GREETINGS: Record<string, GreetingSet> = {
  es: {
    time: {
      manana: ['Buenos días', '¡Buenos días!', 'Buen día', '¡Buen día!', '¡Muy buenos días!'],
      tarde: ['Buenas tardes', '¡Buenas tardes!', '¡Muy buenas tardes!'],
      noche: ['Buenas noches', '¡Buenas noches!', '¡Muy buenas noches!'],
    } as unknown as string[],
    generic: [
      'Hola', '¡Hola!', 'Ey', '¡Ey!', 'Hola de nuevo', 'Gusto saludarte',
      '¡Qué gusto verte!', '¡Qué bueno verte!', '¡Saludos!', 'Hey',
      '¡Buen verte!', '¿Qué tal?', '¡Bienvenido!', '¡Qué alegría!',
    ],
  },
  en: {
    time: {
      manana: ['Good morning', '¡Good morning!', 'Morning!'],
      tarde: ['Good afternoon', '¡Good afternoon!'],
      noche: ['Good evening', '¡Good evening!'],
    } as unknown as string[],
    generic: [
      'Hello', '¡Hello!', 'Hi', '¡Hi!', 'Hey', '¡Hey!', 'Welcome back',
      '¡Good to see you!', '¡Welcome!', '¡What a joy!',
    ],
  },
};

const EMOJIS = ['👋', '✨', '🎉', '🌟', '☀️', '🌙', '💪', '🚀', '😊', '🙌', '🔥', '💫'];

function getDayPart(hour: number): DayPart {
  if (hour >= 5 && hour <= 11) return 'manana';
  if (hour >= 12 && hour <= 18) return 'tarde';
  return 'noche';
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildGreeting(firstName: string, locale: string): string {
  const set = GREETINGS[locale] || GREETINGS.es;
  const hour = new Date().getHours();
  const part = getDayPart(hour);
  const timeGreetings = (set.time as unknown as Record<DayPart, string[]>)[part];
  const useGeneric = Math.random() < 0.6;
  const base = useGeneric ? pick(set.generic) : pick(timeGreetings);

  let greeting = base;

  // ~50% del tiempo agregar emoji
  if (Math.random() < 0.5) {
    const emoji = pick(EMOJIS);
    greeting = Math.random() < 0.5 ? `${emoji} ${base}` : `${base} ${emoji}`;
  }

  if (!firstName) return greeting;

  // Si el saludo ya lleva signos de exclamación, separar con espacio; si no, con coma
  const sep = /[¡!]/.test(base) ? ' ' : ', ';
  return `${greeting}${sep}${firstName}`;
}

export function useDynamicGreeting(firstName: string, locale: string = 'es'): string {
  const [greeting, setGreeting] = useState<string>('');

  useEffect(() => {
    setGreeting(buildGreeting(firstName, locale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, locale]);

  return greeting;
}

export default useDynamicGreeting;
