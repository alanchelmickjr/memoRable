export const expressionColors = {
  admiration: "#ffc58f",
  adoration: "#ffc6cc",
  aestheticAppreciation: "#e2cbff",
  amusement: "#febf52",
  anger: "#b21816",
  annoyance: "#ffffff",
  anxiety: "#6e42cc",
  awe: "#7dabd3",
  awkwardness: "#d7d99d",
  boredom: "#a4a4a4",
  calmness: "#a9cce1",
  concentration: "#336cff",
  contemplation: "#b0aeef",
  confusion: "#c66a26",
  contempt: "#76842d",
  contentment: "#e5c6b4",
  craving: "#54591c",
  determination: "#ff5c00",
  disappointment: "#006c7c",
  disapproval: "#ffffff",
  disgust: "#1a7a41",
  distress: "#c5f264",
  doubt: "#998644",
  ecstasy: "#ff48a4",
  embarrassment: "#63c653",
  empathicPain: "#ca5555",
  enthusiasm: "#ffffff",
  entrancement: "#7554d6",
  envy: "#1d4921",
  excitement: "#fff974",
  fear: "#d1c9ef",
  gratitude: "#ffffff",
  guilt: "#879aa1",
  horror: "#772e7a",
  interest: "#a9cce1",
  joy: "#ffd600",
  love: "#f44f4c",
  neutral: "#879aa1",
  nostalgia: "#b087a1",
  pain: "#8c1d1d",
  pride: "#9a4cb6",
  realization: "#217aa8",
  relief: "#fe927a",
  romance: "#f0cc86",
  sadness: "#305575",
  sarcasm: "#ffffff",
  satisfaction: "#a6ddaf",
  sexualDesire: "#aa0d59",
  shame: "#8a6262",
  surprise: "#70e63a",
  surpriseNegative: "#70e63a",
  surprisePositive: "#7affff",
  sympathy: "#7f88e0",
  tiredness: "#757575",
  triumph: "#ec8132",
};

export const isExpressionColor = (color) => {
  return color in expressionColors;
};

// Get the number of emotional dimensions from the colors
export const EMOTION_DIMENSIONS = Object.keys(expressionColors).length;

// Convert emotion to RGB vector for neural processing
export const emotionToVector = (emotion) => {
  const color = expressionColors[emotion];
  if (!color) return null;

  // Convert hex to RGB
  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;

  return [r, g, b];
};

// Convert RGB vector back to closest emotion
export const vectorToEmotion = (vector) => {
  if (!vector || vector.length !== 3) return 'neutral';

  // Convert vector back to hex color
  const toHex = (n) => {
    const hex = Math.round(n * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  const color = `#${toHex(vector[0])}${toHex(vector[1])}${toHex(vector[2])}`;

  // Find closest matching emotion
  let closestEmotion = 'neutral';
  let minDistance = Infinity;

  for (const [emotion, emotionColor] of Object.entries(expressionColors)) {
    const distance = colorDistance(color, emotionColor);
    if (distance < minDistance) {
      minDistance = distance;
      closestEmotion = emotion;
    }
  }

  return closestEmotion;
};

// Calculate Euclidean distance between two hex colors
const colorDistance = (color1, color2) => {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);

  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);

  return Math.sqrt(
    Math.pow(r1 - r2, 2) +
    Math.pow(g1 - g2, 2) +
    Math.pow(b1 - b2, 2)
  );
};