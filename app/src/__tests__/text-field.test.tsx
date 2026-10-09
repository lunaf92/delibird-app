import { render, screen } from '@testing-library/react-native';
import { DefaultTheme, ThemeProvider } from 'expo-router';
import { StyleSheet } from 'react-native';

import { TextField } from '@/components/ui';

test('extra styles add to the field instead of replacing its border', async () => {
  await render(
    <ThemeProvider value={DefaultTheme}>
      <TextField label="Notes" multiline style={{ minHeight: 88 }} />
    </ThemeProvider>,
  );

  const style = StyleSheet.flatten(screen.getByLabelText('Notes').props.style);
  expect(style).toMatchObject({ borderWidth: 3, minHeight: 88 });
});
