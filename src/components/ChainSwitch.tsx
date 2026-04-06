import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { useChainIds } from "@reactive-dot/react";
import { type ChainId } from "@reactive-dot/core";

export function ChainSwitch(props: { setChainId: (chainId: ChainId) => void; chainId: ChainId }) {
  const chainIds = useChainIds();

  return (
    <Menu as="div" className="relative inline-block text-left">
      <div>
        <MenuButton className="px-4.5 inline-flex w-full justify-center gap-x-1.5 rounded-full bg-white py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
          Current chain: {props.chainId}
          <ChevronDownIcon aria-hidden="true" className="-mr-1 size-5 text-gray-400" />
        </MenuButton>
      </div>

      <MenuItems
        transition
        className="focus:outline-hidden data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-leave:duration-75 data-enter:ease-out data-leave:ease-in absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-lg bg-white shadow-lg ring-1 ring-black/5 transition"
      >
        <div className="py-1">
          {...chainIds.map((chainId) => (
            <MenuItem>
              <button
                className="data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden block w-full bg-white px-4 py-2 text-left text-sm text-gray-700"
                onClick={() => {
                  props.setChainId(chainId);
                }}
              >
                {chainId}
              </button>
            </MenuItem>
          ))}
        </div>
      </MenuItems>
    </Menu>
  );
}
