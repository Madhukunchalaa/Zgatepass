sap.ui.define([
    './BaseController',
    'sap/ui/model/json/JSONModel',
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageToast) {

    "use strict";

    return BaseController.extend("zgpms.meilpower.com.controller.Gatepasslist", {

        onInit: function () {
            // Filter bar model
            var oFilterModel = new JSONModel({
                GatePassType: "NRGP",
                FromDate: null,
                ToDate: null,
                Status: "All",
                GatePassReqNo: ""
            });
            this.getView().setModel(oFilterModel, "filterModel");

            // Model for the second tab (Gate Passes)
            var oHeaderModel = new JSONModel({ gatePassHeaders: [] });
            this.getView().setModel(oHeaderModel, "headerModel");

            // Initial load trigger
            this.onSearch();
        },

        onAfterRendering: function () {
            // Load gate pass list after rendering to ensure bindings are ready
            this.onSearch();
        },

        _loadGatePassList: function (aFilters) {
            var oTable = this.byId("gatePassTable");
            if (!oTable) {
                console.error("Table 'gatePassTable' not found.");
                return;
            }
            var oBinding = oTable.getBinding("items");
            if (oBinding) {
                console.log("Applying filters to GateReqHdrSet:", aFilters);
                oBinding.filter(aFilters);
            } else {
                console.warn("Binding for 'gatePassTable' not ready yet.");
            }
        },

        onRefresh: function () {
            this.onSearch();
        },

        onRefreshHeaders: function () {
            this._loadGatePassHeaders();
        },

        onMainTabSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");
            if (sKey === "GatePasses") {
                this._loadGatePassHeaders();
            } else {
                this.onSearch();
            }
        },

        _loadGatePassHeaders: function () {
            var oTable = this.byId("gatePassHeaderTable");
            var oBinding = oTable ? oTable.getBinding("items") : null;
            if (oBinding) {
                oBinding.filter([]); // Clear or apply headers filters if needed
            }
        },

        _getCurrentFilters: function () {
            var oFilterData = this.getView().getModel("filterModel").getData();
            var aFilters = [];

            if (oFilterData.GatePassType) {
                aFilters.push(new Filter("GatePassType", FilterOperator.EQ, oFilterData.GatePassType));
            }
            if (oFilterData.Status) {
                aFilters.push(new Filter("Status", FilterOperator.EQ, oFilterData.Status));
            }
            if (oFilterData.GatePassReqNo) {
                aFilters.push(new Filter("GatePassReqNo", FilterOperator.Contains, oFilterData.GatePassReqNo));
            }
            return aFilters;
        },

        onSearch: function () {
            var aFilters = this._getCurrentFilters();
            this._loadGatePassList(aFilters);
        },

        onClear: function () {
            this.getView().getModel("filterModel").setData({
                GatePassType: "NRGP",
                FromDate: null,
                ToDate: null,
                Status: "All",
                GatePassReqNo: ""
            });
            this.onSearch();
        },

        onCreate: function () {
            this.getOwnerComponent().getRouter().navTo("GatePassRequestCreation");
        },

        onCreateGatePass: function () {
            this.getOwnerComponent().getRouter().navTo("GatePassCreation", { reqNo: "" });
        },

        onItemPress: function (oEvent) {
            var oItem = oEvent.getSource();
            var oContext = oItem.getBindingContext();
            var sReqNo = oContext.getProperty("GatePassReqNo");

            this.getOwnerComponent().getRouter().navTo("GatePassRequestCreation", {
                reqNo: sReqNo
            });
        }
    });
});
