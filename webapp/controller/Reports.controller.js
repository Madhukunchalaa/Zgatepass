sap.ui.define([
	'./BaseController',
		
	'sap/ui/model/json/JSONModel',
	"sap/ui/VersionInfo",
	"sap/ui/core/mvc/XMLView",
	"sap/ui/core/Core",
    "sap/ui/export/Spreadsheet"
], function (BaseController,JSONModel, VersionInfo, XMLView, oCore,Spreadsheet) {
	
	"use strict";
	
	return BaseController.extend("zgpms.meilpower.com.controller.Reports", {

		onInit: function () {

            // Dummy Master Data
            var oData = {
                gatePassReports: [
                    { gateNo: "GP1001", gateCategory: "RGP", department: "Operations", status: "Pending", year: "2026", quantity: 25 },
                    { gateNo: "GP1002", gateCategory: "RGP", department: "Maintenance", status: "Approved", year: "2025", quantity: 18 },
                    { gateNo: "GP1003", gateCategory: "RGP", department: "Stores", status: "Pending", year: "2026", quantity: 12 },
                    { gateNo: "GP1004", gateCategory: "NRGP", department: "Operations", status: "Rejected", year: "2025", quantity: 20 }
                ],
                filteredData: []
            };

            var oModel = new JSONModel(oData);
            this.getView().setModel(oModel, "reportModel");

            // Initially show all
            oModel.setProperty("/filteredData", oData.gatePassReports);

            // Report Type Dropdown
            var oFilterModel = new JSONModel({
                reportTypes: [
                    { key: "ALL_RGP", text: "All RGP Report" },
                    { key: "PENDING_RGP", text: "Pending RGP Report" },
                    { key: "YEAR_SUMMARY", text: "Pending RGP Summary Year Wise" },
                    { key: "DEPT_SUMMARY", text: "Pending RGP Summary Department Wise" },
                    { key: "ALL_NRGP", text: "All NRGP Report" }
                ]
            });

            this.getView().setModel(oFilterModel, "filterModel");

            this.getView().setModel(new JSONModel({
                isSummary: false
            }), "viewModel");

        },

        onReportTypeChange: function (oEvent) {

            var sKey = oEvent.getSource().getSelectedKey();
            var oViewModel = this.getView().getModel("viewModel");

            if (sKey === "YEAR_SUMMARY" || sKey === "DEPT_SUMMARY") {
                oViewModel.setProperty("/isSummary", true);
            } else {
                oViewModel.setProperty("/isSummary", false);
            }
        },

        onSearch: function () {

            var oModel = this.getView().getModel("reportModel");
            var aData = oModel.getProperty("/gatePassReports");

            var sDept = this.byId("deptFilter").getValue();
            var sReportType = this.byId("reportType").getSelectedKey();

            var aFiltered = aData;

            // Filter by Department
            if (sDept) {
                aFiltered = aFiltered.filter(d =>
                    d.department.toLowerCase().includes(sDept.toLowerCase())
                );
            }

            // Filter by Report Type
            if (sReportType === "ALL_RGP") {
                aFiltered = aFiltered.filter(d => d.gateCategory === "RGP");
            }

            if (sReportType === "PENDING_RGP") {
                aFiltered = aFiltered.filter(d =>
                    d.gateCategory === "RGP" && d.status === "Pending"
                );
            }

            if (sReportType === "ALL_NRGP") {
                aFiltered = aFiltered.filter(d => d.gateCategory === "NRGP");
            }

            oModel.setProperty("/filteredData", aFiltered);

            // Summary Logic
            if (sReportType === "YEAR_SUMMARY") {

                var aPending = aFiltered.filter(d => d.status === "Pending");
                var oYearMap = {};

                aPending.forEach(function (oItem) {
                    oYearMap[oItem.year] = (oYearMap[oItem.year] || 0) + 1;
                });

                var aSummary = Object.keys(oYearMap).map(function (sYear) {
                    return {
                        key: sYear,
                        count: oYearMap[sYear]
                    };
                });

                this.getView().setModel(new JSONModel({
                    summaryData: aSummary
                }), "summaryModel");
            }

            if (sReportType === "DEPT_SUMMARY") {

                var aPendingDept = aFiltered.filter(d => d.status === "Pending");
                var oDeptMap = {};

                aPendingDept.forEach(function (oItem) {
                    oDeptMap[oItem.department] = (oDeptMap[oItem.department] || 0) + 1;
                });

                var aDeptSummary = Object.keys(oDeptMap).map(function (sDept) {
                    return {
                        key: sDept,
                        count: oDeptMap[sDept]
                    };
                });

                this.getView().setModel(new JSONModel({
                    summaryData: aDeptSummary
                }), "summaryModel");
            }

            MessageToast.show("Report Generated");

        },

        onDownload: function () {

            var aData = this.getView().getModel("reportModel")
                .getProperty("/filteredData");

            var oSettings = {
                workbook: {
                    columns: [
                        { label: "Gate No", property: "gateNo" },
                        { label: "Category", property: "gateCategory" },
                        { label: "Department", property: "department" },
                        { label: "Status", property: "status" },
                        { label: "Year", property: "year" },
                        { label: "Quantity", property: "quantity" }
                    ]
                },
                dataSource: aData,
                fileName: "GatePass_Report.xlsx"
            };

            var oSheet = new Spreadsheet(oSettings);
            oSheet.build();
        }

    });
});
