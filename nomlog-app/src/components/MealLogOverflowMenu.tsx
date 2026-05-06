import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { MoreHorizontal, Pencil, Star, Trash2, MessageSquare } from 'lucide-react-native';

export type MealLogOverflowMenuProps = {
  mealLogId: string;
  isFavorited: boolean;
  onEditInChat?: () => void;
  /** Inline nutrition/form edit for meal logs, or favorite templates (`/meal-log-edit` with `favoriteId`). */
  onEditInline?: () => void;
  /** When true, edit actions are visible but tappable disabled (e.g. nutrition analysis in progress). */
  editDisabled?: boolean;
  onFavorite?: (mealLogId: string) => void | Promise<void>;
  onUnfavorite?: (mealLogId: string) => void | Promise<void>;
  onDelete?: (mealLogId: string) => void | Promise<void>;
  /** When both are set, the menu is controlled (e.g. close when the meal card is tapped). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const MealLogOverflowMenu: React.FC<MealLogOverflowMenuProps> = ({
  mealLogId,
  isFavorited,
  onEditInChat,
  onEditInline,
  editDisabled = false,
  onFavorite,
  onUnfavorite,
  onDelete,
  open: openProp,
  onOpenChange,
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = openProp !== undefined && onOpenChange !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (controlled) onOpenChange(next);
    else {
      setUncontrolledOpen(next);
      onOpenChange?.(next);
    }
  };

  const close = () => setOpen(false);

  const toggle = () => setOpen(!open);

  const handleEditInChat = () => {
    if (editDisabled) return;
    close();
    onEditInChat?.();
  };

  const handleEditInline = () => {
    if (editDisabled) return;
    close();
    onEditInline?.();
  };

  const handleDelete = () => {
    close();
    if (!onDelete) return;
    Alert.alert(
      'Delete Meal Log',
      'Are you sure you want to delete this meal log? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void onDelete(mealLogId);
          },
        },
      ]
    );
  };

  const handleFavorite = () => {
    close();
    if (onFavorite) void onFavorite(mealLogId);
  };

  const handleUnfavorite = () => {
    close();
    if (!onUnfavorite) return;
    Alert.alert(
      'Remove from favorites',
      'Remove this meal from your favorites? You can add it again anytime from the meal card menu.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void onUnfavorite(mealLogId);
          },
        },
      ]
    );
  };

  const showFavoriteRow = !!(onFavorite || onUnfavorite);
  const showEditSection = !!(onEditInChat || onEditInline);

  return (
    <View style={styles.menuContainer}>
      <TouchableOpacity
        style={styles.menuButton}
        onPress={toggle}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MoreHorizontal size={16} color="#6a7282" strokeWidth={2} />
      </TouchableOpacity>

      {open && (
        <View style={styles.menuDropdown}>
          {showEditSection ? (
            <>
              {onEditInChat ? (
                <TouchableOpacity
                  style={[styles.menuItem, editDisabled && styles.menuItemDisabled]}
                  onPress={handleEditInChat}
                  disabled={editDisabled}
                  accessibilityState={{ disabled: editDisabled }}
                >
                  <MessageSquare
                    size={16}
                    color={editDisabled ? '#9ca3af' : '#101828'}
                    strokeWidth={2}
                  />
                  <Text style={[styles.menuItemText, editDisabled && styles.menuItemTextDisabled]}>
                    Edit in chat
                  </Text>
                </TouchableOpacity>
              ) : null}
              {onEditInline ? (
                <TouchableOpacity
                  style={[styles.menuItem, editDisabled && styles.menuItemDisabled]}
                  onPress={handleEditInline}
                  disabled={editDisabled}
                  accessibilityState={{ disabled: editDisabled }}
                >
                  <Pencil size={16} color={editDisabled ? '#9ca3af' : '#101828'} strokeWidth={2} />
                  <Text style={[styles.menuItemText, editDisabled && styles.menuItemTextDisabled]}>
                    Edit manually
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
          {showEditSection && showFavoriteRow ? <View style={styles.menuSeparator} /> : null}
          {showFavoriteRow ? (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={isFavorited ? handleUnfavorite : handleFavorite}
            >
              <Star
                size={16}
                color="#101828"
                strokeWidth={2}
                fill={isFavorited ? '#101828' : 'transparent'}
              />
              <Text style={styles.menuItemText}>
                {isFavorited ? 'Remove from favorites' : 'Favorite this meal'}
              </Text>
            </TouchableOpacity>
          ) : null}
          {onDelete ? (
            <>
              {(showEditSection || showFavoriteRow) ? <View style={styles.menuSeparator} /> : null}
              <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                <Trash2 size={16} color="#dc2626" strokeWidth={2} />
                <Text style={[styles.menuItemText, styles.deleteText]}>Delete</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  menuContainer: {
    position: 'relative',
  },
  menuButton: {
    padding: 4,
    borderRadius: 10,
  },
  menuDropdown: {
    position: 'absolute',
    top: 32,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 220,
    zIndex: 1000,
    paddingVertical: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 14,
    color: '#101828',
    fontWeight: '400',
  },
  menuItemDisabled: {
    opacity: 0.85,
  },
  menuItemTextDisabled: {
    color: '#9ca3af',
  },
  deleteText: {
    color: '#dc2626',
  },
  menuSeparator: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 4,
  },
});
