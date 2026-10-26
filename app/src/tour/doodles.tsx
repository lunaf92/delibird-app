import Svg, { Circle, Path } from 'react-native-svg';

export type DoodleName = 'list' | 'share-in' | 'lists' | 'people' | 'gift';

/** The pen drawings on the welcome tour, in the look's pen and marker colours. Decoration only. */
export function Doodle({ name, ink, accent }: { name: DoodleName; ink: string; accent: string }) {
  const pen = {
    fill: 'none',
    stroke: ink,
    strokeWidth: 4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  const marker = { ...pen, stroke: accent };
  return (
    <Svg width={220} height={200} viewBox="0 0 240 220" aria-hidden>
      {name === 'list' && (
        <>
          <Path {...pen} d="M62 40 C 100 36, 140 42, 160 38 L 164 186 C 120 190, 90 184, 58 188 Z" />
          <Path {...pen} d="M80 74 l8 8 l14 -18" />
          <Path {...pen} d="M114 76 C 126 74, 138 78, 146 75" />
          <Path {...marker} d="M80 112 l8 8 l14 -18" />
          <Path {...pen} d="M114 114 C 126 112, 138 116, 146 113" />
          <Path {...pen} d="M82 152 C 86 148, 96 148, 100 152" />
          <Path {...pen} d="M114 152 C 126 150, 138 154, 146 151" />
          <Path {...marker} d="M178 30 l6 -12 M188 42 l12 -4 M172 22 l-2 -12" />
        </>
      )}
      {name === 'share-in' && (
        <>
          <Path {...pen} d="M30 60 C 60 56, 80 62, 100 58 L 104 170 C 76 174, 54 168, 28 172 Z" />
          <Path {...pen} d="M44 80 h44 M44 96 h30" />
          <Path {...pen} d="M46 120 C 56 112, 76 112, 86 120 L 82 150 L 50 150 Z" />
          <Path {...marker} d="M112 110 C 132 104, 150 104, 168 110" />
          <Path {...marker} d="M156 98 l14 12 l-14 12" />
          <Path {...pen} d="M180 60 C 196 58, 210 62, 216 60 L 218 170 C 204 172, 192 168, 178 172 Z" />
          <Path {...pen} d="M188 80 h22 M188 96 h16" />
          <Circle {...pen} cx={198} cy={132} r={14} />
          <Path {...pen} d="M198 124 v16 M190 132 h16" />
        </>
      )}
      {name === 'lists' && (
        <>
          <Path {...pen} d="M20 40 C 50 38, 70 42, 92 40 L 94 180 C 70 182, 44 178, 18 182 Z" />
          <Path {...pen} d="M148 40 C 172 38, 196 42, 222 40 L 224 180 C 196 182, 172 178, 146 182 Z" />
          <Path {...pen} d="M32 60 h44 M160 60 h46" />
          <Path {...marker} d="M100 96 C 110 92, 130 92, 140 96 L 136 134 C 124 138, 114 138, 104 134 Z" />
          <Path {...marker} d="M112 96 C 112 84, 128 84, 128 96" />
          <Path
            {...pen}
            strokeDasharray="6 8"
            d="M92 114 C 80 116, 64 112, 52 118 M148 114 C 160 112, 176 116, 190 112"
          />
        </>
      )}
      {name === 'people' && (
        <>
          <Path {...pen} d="M84 50 C 110 48, 130 52, 154 50 L 156 170 C 130 172, 108 168, 82 172 Z" />
          <Path {...pen} d="M98 76 h42 M98 96 h30 M98 116 h38" />
          <Path {...marker} d="M156 90 C 176 80, 190 72, 206 64" />
          <Circle {...pen} cx={214} cy={56} r={10} />
          <Path {...pen} d="M200 86 C 204 76, 224 76, 228 86" />
          <Path {...marker} d="M82 110 C 62 108, 46 104, 30 100" />
          <Circle {...pen} cx={22} cy={90} r={10} />
          <Path {...pen} d="M8 120 C 12 110, 32 110, 36 120" />
          <Path {...marker} d="M156 140 C 176 146, 190 154, 206 160" />
          <Circle {...pen} cx={214} cy={166} r={10} />
          <Path {...pen} d="M200 196 C 204 186, 224 186, 228 196" />
        </>
      )}
      {name === 'gift' && (
        <>
          <Path {...pen} d="M70 100 C 100 96, 140 102, 170 98 L 166 180 C 136 184, 104 180, 74 182 Z" />
          <Path {...pen} d="M62 80 C 100 76, 140 82, 178 78 L 178 100 C 140 104, 100 98, 62 102 Z" />
          <Path {...marker} d="M120 78 L 120 182" />
          <Path
            {...marker}
            d="M120 78 C 100 54, 84 60, 96 74 C 104 80, 114 80, 120 78 C 126 80, 136 80, 144 74 C 156 60, 140 54, 120 78"
          />
          <Path {...pen} d="M30 40 C 40 30, 52 30, 62 40 C 52 50, 40 50, 30 40 Z" />
          <Path {...pen} d="M22 60 L 70 22" />
        </>
      )}
    </Svg>
  );
}
