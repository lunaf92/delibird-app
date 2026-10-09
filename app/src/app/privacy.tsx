import { useTranslation } from 'react-i18next';

import { Body, Heading, Screen, Title } from '@/components/ui';

type Section = { heading: string; body: string[] };

/** The privacy policy, open to everyone at /privacy (it is also the link the app stores ask for). */
export default function PrivacyScreen() {
  const { t } = useTranslation();
  const sections = t('privacy.sections', { returnObjects: true }) as Section[];
  return (
    <Screen>
      <Title>{t('privacy.title')}</Title>
      <Body muted>{t('privacy.updated')}</Body>
      <Body>{t('privacy.intro')}</Body>
      {sections.map((section) => (
        <SectionView key={section.heading} section={section} />
      ))}
    </Screen>
  );
}

function SectionView({ section }: { section: Section }) {
  return (
    <>
      <Heading>{section.heading}</Heading>
      {section.body.map((paragraph) => (
        <Body key={paragraph}>{paragraph}</Body>
      ))}
    </>
  );
}
