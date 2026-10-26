import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { fetchLists, updateMe } from '@/api/client';
import { useApi, useResource } from '@/api/use-api';
import { useSignedIn } from '@/auth/context';
import { Body, Button, Screen } from '@/components/ui';
import { useLook } from '@/theme/context';
import { offsetShadow, sketchCorners } from '@/theme/sketch';
import { Doodle, type DoodleName } from '@/tour/doodles';
import { useGuide } from '@/tour/guide';

const STEPS: { key: string; doodle: DoodleName }[] = [
  { key: 'welcome', doodle: 'list' },
  { key: 'add', doodle: 'share-in' },
  { key: 'lists', doodle: 'lists' },
  { key: 'share', doodle: 'people' },
  { key: 'surprise', doodle: 'gift' },
  { key: 'ready', doodle: 'list' },
];

/**
 * The welcome tour: a few screens on what Strena does, shown once after the first sign-in and again from
 * Settings. The last one offers the guided first item.
 */
export default function TourScreen() {
  const { t } = useTranslation();
  const { colors, fonts } = useLook();
  const { user, setUser } = useSignedIn();
  const api = useApi();
  const guide = useGuide();
  const { data: lists } = useResource(fetchLists);
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  // Seen once it opens, so it never comes back by itself, even if the app is closed halfway through.
  const unseen = user?.tour_seen === false;
  useEffect(() => {
    if (!unseen) return;
    api((token, language) => updateMe(token, { tour_seen: true }, language)).then(setUser, () => undefined);
  }, [api, setUser, unseen]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const heading = {
    color: colors.ink,
    fontFamily: fonts.heading,
    fontSize: Math.round(28 * fonts.scale),
    fontWeight: fonts.heading ? ('400' as const) : ('700' as const),
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Body muted>{t('tour.counter', { step: index + 1, total: STEPS.length })}</Body>
        {!last && <Button variant="link" label={t('tour.skip')} onPress={close} />}
      </View>

      <View
        style={[
          styles.picture,
          { borderColor: colors.ink, backgroundColor: colors.bg },
          sketchCorners(),
          offsetShadow(colors.ink, 5),
        ]}>
        <Doodle name={step.doodle} ink={colors.ink} accent={colors.accent} />
      </View>

      <Text accessibilityRole="header" style={heading}>
        {t(`tour.${step.key}Title`)}
      </Text>
      <Body>{t(`tour.${step.key}Body`)}</Body>

      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {STEPS.map((dot, at) => (
          <View
            key={dot.key}
            style={[
              styles.dot,
              { borderColor: colors.ink, backgroundColor: at === index ? colors.ink : 'transparent' },
            ]}
          />
        ))}
      </View>

      {last ? (
        <>
          <Button
            label={t('tour.showMe')}
            onPress={() => guide.start(lists?.find((list) => list.is_default)?.id)}
          />
          <Button variant="secondary" label={t('tour.onMyOwn')} onPress={close} />
          <Button variant="link" label={t('tour.back')} onPress={() => setIndex(index - 1)} />
        </>
      ) : (
        <View style={styles.buttons}>
          {index > 0 && (
            <View style={styles.grow}>
              <Button variant="secondary" label={t('tour.back')} onPress={() => setIndex(index - 1)} />
            </View>
          )}
          <View style={styles.wide}>
            <Button label={t('tour.next')} onPress={() => setIndex(index + 1)} />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  picture: { borderWidth: 3, alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 4 },
  dot: { width: 14, height: 14, borderWidth: 3, borderRadius: 7 },
  buttons: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1 },
  wide: { flex: 2 },
});
