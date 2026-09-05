import { useEffect, useRef, useState } from 'react';
import { Button } from '@appica/ui-react/button';
import { Card, CardHeader, CardTitle } from '@appica/ui-react/card';
import { Input } from '@appica/ui-react/input';
import { Spinner } from '@appica/ui-react/spinner';
import { Eye, EyeOff } from '@appica/icons-react';

function Empty({ description }) {
  return <div className="py-10 text-center text-sm text-foreground-muted">{description}</div>;
}

function NumberRoller({ value, format = (number) => String(number), className = '', ariaLabel }) {
  const target = Number(value);
  const safeTarget = Number.isFinite(target) ? target : 0;
  const finalText = format(safeTarget);
  const [fromText, setFromText] = useState(finalText);
  const [animating, setAnimating] = useState(false);
  const previous = useRef('');

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const oldText = previous.current || finalText.replace(/\d/g, '0');
    previous.current = finalText;
    setFromText(oldText);
    if (oldText === finalText || reduceMotion) {
      setAnimating(false);
      return undefined;
    }
    setAnimating(true);
    const timer = window.setTimeout(() => setAnimating(false), 450);
    return () => window.clearTimeout(timer);
  }, [finalText]);

  const chars = [...finalText];
  return <span className={`dashboard-number-roller ${animating ? 'is-animating' : ''} ${className}`}>
    <span aria-hidden="true" className="dashboard-number-visual">{chars.map((char, index) => {
      const oldChar = [...fromText][index] || char;
      if (!/\d/.test(char) || oldChar === char) return <span key={`${index}-${char}`} className="dashboard-number-glyph">{char}</span>;
      return <span key={`${index}-${char}`} className="dashboard-digit-slot"><span className={animating ? 'dashboard-digit-track is-rolling' : 'dashboard-digit-track'}><span>{oldChar}</span><span>{char}</span></span></span>;
    })}</span>
    <span className="sr-only" aria-label={ariaLabel || finalText}>{finalText}</span>
  </span>;
}

function DescriptionList({ items }) {
  return (
    <dl className="grid gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[7rem_1fr] gap-3">
          <dt className="text-foreground-muted">{label}</dt>
          <dd className="m-0 min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SectionCard({ title, children, className }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <div className="px-4 pb-4">{children}</div>
    </Card>
  );
}

function Metric({ title, value, icon }) {
  return (
    <div className="col-span-12 lg:col-span-6">
      <Card className="metric-card">
        <div className="flex items-center gap-3 px-3 py-4">
          <span className="text-info-emphasis text-xl">{icon}</span>
          <div>
            <div className="text-sm text-foreground-muted">{title}</div>
            <div className="metric-value text-foreground-intense">{typeof value === 'number' ? <NumberRoller value={value} /> : value}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <Input
      {...props}
      type={show ? 'text' : 'password'}
      endSlot={
        <Button variant="ghost" size="icon-sm" className="-me-1.5" aria-label={show ? '隐藏密码' : '显示密码'} onClick={() => setShow((v) => !v)}>
          {show ? <EyeOff /> : <Eye />}
        </Button>
      }
    />
  );
}

function LoadingButton({ loading, children, ...props }) {
  return (
    <Button {...props} disabled={loading || props.disabled}>
      {loading && <Spinner variant="dots" currentColor data-icon="start" className="text-base" />}
      {children}
    </Button>
  );
}

const statusTagVariant = {
  overdue: 'error', due: 'warning', upcoming: 'success', pending: 'secondary', disabled: 'outline', notified: 'soft'
};
const statusTagLabel = {
  overdue: '已逾期', due: '需要处理', upcoming: '未到提醒', pending: '待确认', disabled: '已停用', notified: '已通知'
};

export { Empty, DescriptionList, SectionCard, Metric, NumberRoller, PasswordInput, LoadingButton, statusTagVariant, statusTagLabel };
