import axios from 'axios';
import {GEMINI_API_KEY} from '@env';

export interface TripSuggestion {
  title: string;
  routeSummary: string;
  estimatedDuration: string;
  estimatedDistance: string;
  difficulty: 'Easy' | 'Moderate' | 'Challenging';
  bestStartTime: string;
  weatherAdvice: string;
  stops: any[];
  tips: string[];
}

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const callGemini = async (prompt: string) => {
  const response = await axios.post(
    `${GEMINI_URL}?key=${GEMINI_API_KEY}`,
    {
      contents: [{parts: [{text: prompt}]}],
      generationConfig: {temperature: 0.7, maxOutputTokens: 8192},
    },
    {headers: {'Content-Type': 'application/json'}},
  );
  return response.data;
};

const parseGeminiResponse = (
  data: any,
  origin: string,
  destination: string,
  isRoundTrip: boolean,
  totalDays: number,
) => {
  const content = data.candidates[0].content.parts[0].text;

  // Extract JSON safely
  let jsonStr = content;
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonStr = content.substring(firstBrace, lastBrace + 1);
    }
  }

  const parsed = JSON.parse(jsonStr.trim());

  // Flatten days into stops
  let allStops: any[] = [];
  if (parsed.days?.length > 0) {
    allStops = parsed.days.flatMap((d: any) =>
      (d.stops || []).map((s: any) => ({
        ...s,
        dayLabel: d.title,
        day: d.day,
      })),
    );
  } else if (parsed.stops) {
    allStops = parsed.stops;
  }

  // Safety net — ensure last stop is always destination
  if (allStops.length > 0) {
    const lastStop = allStops[allStops.length - 1];
    if (lastStop.type !== 'destination') {
      allStops.push({
        id: 'final_dest',
        name: isRoundTrip ? `${origin} — Back Home!` : destination,
        description: isRoundTrip
          ? `Ride complete! You are back home. Total journey done.`
          : `You made it! Check in, rest up and celebrate the ride.`,
        type: 'destination',
        time: '',
        duration: '',
        distance: parsed.estimatedDistance || '',
        address: isRoundTrip ? origin : destination,
        speciality: isRoundTrip ? 'Home — ride complete!' : 'End of journey',
        lat: 0,
        lng: 0,
        day: totalDays,
        dayLabel: `Day ${totalDays}`,
      });
    }
  }

  return {...parsed, stops: allStops};
};

export const generateTripPlan = async (
  origin: string,
  destination: string,
  date: string,
  startTime: string,
  riderCount: number,
  preferences: string[],
  extraDestinations: string[] = [],
  isRoundTrip: boolean = false,
  totalDays: number = 1,
): Promise<TripSuggestion> => {
  const allDestinations = [destination, ...extraDestinations];
  const routeDesc = isRoundTrip
    ? `${origin} → ${allDestinations.join(' → ')} → ${origin} (Round Trip)`
    : `${origin} → ${allDestinations.join(' → ')}`;

  const prompt = `You are an expert Indian motorcycle trip planner. Plan a detailed ${totalDays}-day ${isRoundTrip ? 'ROUND TRIP' : 'one way'} group bike ride.

ROUTE: ${routeDesc}
DATE: ${date}
START TIME: ${startTime}
RIDERS: ${riderCount}
PREFERENCES: ${preferences.join(', ')}
TOTAL DAYS: ${totalDays}

STRICT RULES YOU MUST FOLLOW:
1. ALL stops (cafes, restaurants, fuel, hidden gems) MUST be on or within 5km of the actual highway route. Do NOT suggest off-route places.
2. For EACH stop provide FULL ADDRESS: "Name, Area, City, State"
3. For restaurants mention what they are FAMOUS FOR specifically
4. Calculate EXACT arrival times based on ${startTime} start at 55 kmph average group speed
5. Organize ALL stops by DAY — every stop must have a day number
6. Day 1 MUST start at ${origin} and end with a STAY stop near ${destination}
7. ${isRoundTrip ? `Day ${totalDays} MUST include return journey from ${destination} back to ${origin} with stops along the way` : `Day ${totalDays} MUST end at ${destination}`}
8. The VERY LAST stop of the entire trip MUST be type "destination" — at ${isRoundTrip ? origin : destination}
9. For STAY stops: include actual hotel/resort name, price range (Budget/Mid-range/Luxury), and mention secure bike parking if available
10. For adventure preferences suggest camping/outdoor stays
11. Include hidden gems, tourist spots, viewpoints ON or NEAR the route
12. Each stop MUST have realistic lat/lng coordinates

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "title": "catchy trip name",
  "routeSummary": "2-3 sentence description mentioning actual places",
  "estimatedDuration": "X hours per day",
  "estimatedDistance": "XXX km total",
  "difficulty": "Easy|Moderate|Challenging",
  "bestStartTime": "${startTime}",
  "weatherAdvice": "weather advice for ${date} on this route",
  "days": [
    {
      "day": 1,
      "title": "Day 1 — ${origin} to ${destination}",
      "stops": [
        {
          "id": "d1_s1",
          "name": "Place Name, Area, City",
          "description": "Why stop here. What to do.",
          "type": "meeting|checkpoint|tea|lunch|fuel|hidden_gem|destination|stay",
          "time": "HH:MM AM/PM",
          "duration": "XX mins",
          "distance": "XX km from ${origin}",
          "address": "Full address, City, State",
          "speciality": "Famous for X",
          "lat": 11.12,
          "lng": 77.56
        }
      ]
    }${totalDays > 1 ? `,
    {
      "day": 2,
      "title": "Day 2 — ${isRoundTrip ? `${destination} back to ${origin}` : 'Explore & Return'}",
      "stops": []
    }` : ''}
  ],
  "tips": ["tip1", "tip2", "tip3", "tip4", "tip5"]
}`;

  try {
    const data = await callGemini(prompt);
    return parseGeminiResponse(data, origin, destination, isRoundTrip, totalDays);
  } catch (error: any) {
    const status = error?.response?.status;
    console.error('Gemini error:', error?.response?.data || error?.message);

    if (status === 429 || status === 503) {
      console.log(`Error ${status} — retrying in 15s...`);
      await new Promise(resolve => setTimeout(resolve, 15000));
      try {
        const data = await callGemini(prompt);
        return parseGeminiResponse(data, origin, destination, isRoundTrip, totalDays);
      } catch (retryError) {
        console.error('Retry failed, using mock data');
        return mockTripPlan(origin, destination, startTime, isRoundTrip, totalDays);
      }
    }

    return mockTripPlan(origin, destination, startTime, isRoundTrip, totalDays);
  }
};

const mockTripPlan = (
  origin: string,
  destination: string,
  startTime: string,
  isRoundTrip: boolean = false,
  totalDays: number = 1,
): TripSuggestion => ({
  title: `Epic Ride: ${origin} to ${destination}`,
  routeSummary: `A thrilling group ride from ${origin} to ${destination} through scenic highways and mountain passes.`,
  estimatedDuration: '6 hours 30 mins per day',
  estimatedDistance: totalDays > 1 ? '560 km total' : '280 km',
  difficulty: 'Moderate',
  bestStartTime: startTime,
  weatherAdvice: 'Clear skies expected. Carry a light jacket for early morning chill.',
  stops: [
    {id:'s1', name:`${origin} Petrol Bunk`, description:'Meeting point. Fuel up and form convoy.', type:'meeting', time:startTime, duration:'20 mins', distance:'0 km', address:origin, speciality:'Group assembly point', lat:0, lng:0, day:1, dayLabel:'Day 1'},
    {id:'s2', name:'Highway Dhaba', description:'Famous for hot chai and poha.', type:'tea', time:'8:30 AM', duration:'20 mins', distance:'80 km', address:'NH Highway', speciality:'Filter coffee & snacks', lat:0, lng:0, day:1, dayLabel:'Day 1'},
    {id:'s3', name:'Fuel & Sync Stop', description:'Last fuel before destination.', type:'fuel', time:'10:00 AM', duration:'15 mins', distance:'150 km', address:'Highway Junction', speciality:'Fuel & rest', lat:0, lng:0, day:1, dayLabel:'Day 1'},
    {id:'s4', name:'Hilltop Restaurant', description:'Stunning valley views. Known for thali.', type:'lunch', time:'12:30 PM', duration:'45 mins', distance:'200 km', address:'Mountain Road', speciality:'Veg thali & fresh lime soda', lat:0, lng:0, day:1, dayLabel:'Day 1'},
    {id:'s5', name:'Hidden Waterfall Trail', description:'Secret spot only locals know.', type:'hidden_gem', time:'2:00 PM', duration:'30 mins', distance:'230 km', address:'3km off highway', speciality:'Scenic waterfall', lat:0, lng:0, day:1, dayLabel:'Day 1'},
    {id:'s6', name:`Hotel Mountain View, ${destination}`, description:'Biker-friendly hotel with secure parking and mountain views.', type:'stay', time:'5:00 PM', duration:'overnight', distance:'280 km', address:destination, speciality:'Mid-range • Secure bike parking • Restaurant on-site', lat:0, lng:0, day:1, dayLabel:'Day 1'},
    ...(totalDays > 1 ? [
      {id:'s7', name:`${destination} Local Cafe`, description:'Morning chai and breakfast before return.', type:'tea', time:'7:00 AM', duration:'30 mins', distance:'0 km', address:destination, speciality:'Filter coffee & idli', lat:0, lng:0, day:2, dayLabel:'Day 2'},
      {id:'s8', name:'Scenic Viewpoint', description:'Last view of the hills before heading back.', type:'hidden_gem', time:'9:00 AM', duration:'20 mins', distance:'50 km', address:'Return route', speciality:'Panoramic views', lat:0, lng:0, day:2, dayLabel:'Day 2'},
      {id:'s9', name:'Return Lunch Stop', description:'Good thali on the return route.', type:'lunch', time:'12:00 PM', duration:'45 mins', distance:'150 km', address:'Highway town', speciality:'Thali & fresh juice', lat:0, lng:0, day:2, dayLabel:'Day 2'},
      {id:'s10', name: isRoundTrip ? `${origin} — Back Home!` : destination, description: isRoundTrip ? 'Ride complete! You made it back safely.' : 'Final destination reached!', type:'destination', time:'4:30 PM', duration:'', distance:'280 km', address: isRoundTrip ? origin : destination, speciality:'End of journey', lat:0, lng:0, day:2, dayLabel:'Day 2'},
    ] : [
      {id:'s10', name:destination, description:'You made it! Check in and celebrate the ride.', type:'destination', time:'4:30 PM', duration:'', distance:'280 km', address:destination, speciality:'End of journey', lat:0, lng:0, day:1, dayLabel:'Day 1'},
    ]),
  ],
  tips: [
    'Start exactly on time — group rides get delayed easily',
    'Keep convoy gaps of 3-4 seconds between bikes',
    'Designate a sweep rider at the back of the group',
    'Fill fuel at every opportunity — don\'t risk running empty',
    'Save local police number for the route before starting',
  ],
});