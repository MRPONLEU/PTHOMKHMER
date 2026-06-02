import React from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { GripVertical, ChevronDown, Edit2, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
// Assuming these are available elsewhere, I'll need to pass them down or import them
// This is for demonstration. I might need to make 'SortableCategoryItem' a child or pass its logic.

export const CategoryList = ({ categories, sensors, handleDragEnd, SortableCategoryItem }) => {
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={categories.map((c: any) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-4">
          {categories.map((category: any, index: number) => (
            <SortableCategoryItem key={category.id} category={category} index={index} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
