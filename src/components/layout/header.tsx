"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface HeaderProps {
  segment: string;
  onSegmentChange: (value: string) => void;
}

export function Header({ segment, onSegmentChange }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      <div className="flex flex-1 items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Philippine Fandom Intelligence
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Segment:</span>
            <Select value={segment} onValueChange={onSegmentChange}>
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">All Segments</span>
                </SelectItem>
                <SelectItem value="postpaid">
                  <span className="flex items-center gap-2">
                    ABC Postpaid
                    <Badge variant="secondary" className="text-[10px] px-1">
                      Gen Y/Z
                    </Badge>
                  </span>
                </SelectItem>
                <SelectItem value="prepaid">
                  <span className="flex items-center gap-2">
                    CDE Prepaid
                    <Badge variant="secondary" className="text-[10px] px-1">
                      Gen Y/Z
                    </Badge>
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </header>
  );
}
