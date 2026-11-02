import type { ComponentProps } from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';

import { TextField } from '@/shared/ui';

type Props<T extends FieldValues> = Omit<ComponentProps<typeof TextField>, 'value' | 'onChangeText' | 'error'> & {
  // Le 3e paramètre accepte les formulaires dont les valeurs sont transformées à la validation.
  control: Control<T, any, any>;
  name: Path<T>;
};

/** Relie un champ de saisie au formulaire (valeur, validation, message d'erreur). */
export function FormField<T extends FieldValues>({ control, name, ...rest }: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
        <TextField
          ref={ref}
          value={(value as string | undefined) ?? ''}
          onChangeText={onChange}
          onBlur={onBlur}
          error={error?.message}
          {...rest}
        />
      )}
    />
  );
}
